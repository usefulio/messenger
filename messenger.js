function parseEmailAddress(addressOrArray) {
  var emails = addressOrArray;
  if (!_.isArray(emails))
    emails = [emails];
  return _.map(emails, function (email) {
    var name = /"([^"]+)"/.exec(email);
    var address = /<([^>]+)>/.exec(email);
    if (address) {
      name = name && name[1];
      address = address[1];
      var threadId = /([^+]+)\+/.exec(address);
      var recipientId = /\+([^+]+)@/.exec(address);
      threadId = threadId && threadId[0];
      recipientId = recipientId && recipientId[0];
      return {
        email: address
        , name: name
        , threadId: threadId
        , recipientId: recipientId
      };
    } else {
      return {
        email: email
      };
    }
  });
}

function getRecipientId (address, messenger) {
  var user;
  if (messenger.config.users)
    user = messenger.config.users.findOne({"emails.address": address});
  if (!user && messenger.config.recipients)
    user = messenger.config.recipients.findOne({email: address});
  return user && user._id || address;
}

Messenger = {};

Messenger.factory = function (messenger, config) {
  if (!messenger)
    messenger = {};

  messenger.config = config;
  messenger.router = new Mailer.Router();

  messenger.route = function (routeName, actionOrOptions, parentRoute) {
    parentRoute = parentRoute || 'default';
    if (_.isFunction(actionOrOptions))
      return messenger.router.route(routeName, actionOrOptions, parentRoute);
    else
      return messenger.router.route(routeName, [Mailer.helper.resolvePropertyValues, actionOrOptions], parentRoute);
  };

  messenger.send = function (routeName, email, options) {
    if (!_.isString(routeName)) {
      options = email;
      email = routeName;
      routeName = 'default';
    }
    return messenger.router.send(routeName, email || {}, options || {});
  };

  if (messenger.config.mailer) {
    messenger.config.mailer.config.threading = {
      onRecieveRoute: 'messengerSend'
      , setOutboundProperties: function (email) {
        var to = parseEmailAddress(email.to)[0];
        var from = parseEmailAddress(email.from)[0];

        if (to.threadId)
          email.threadId = to.threadId;
        if (to.recipientId)
          email.toId = to.recipientId;
        else
          email.toId = getRecipientId(to.email, messenger);

        email.fromId = getRecipientId(from.email, messenger);
      }
    };

    messenger.config.mailer.router.route('messengerSend', function (email) {
      messenger.send(email);
    });

    if (messenger.config.outboundAddress)
      messenger.config.mailer.config.threading.from = function (from, email) {
        return messenger.config.outboundAddress;
      };

    if (messenger.config.outboundDomain)
      messenger.config.mailer.config.threading.replyTo = function (replyTo, email) {
        return replyTo || email.threadId + "+" + email.fromId + "@" + messenger.config.outboundDomain;
      };
  }

  messenger.router.route('assignRecipientId', function (message) {
    if (messenger.config.recipients)
      _.each(['fromId', 'toId'], function (propertyName) {
        var users = _.chain([message[propertyName]])
          .flatten()
          .map(function (user) {
            if (_.isString(user))
              return user;
            else if (_.isObject(user)) {
              // user should be an object with a single property which represents
              // the communication method we use to get ahold of that user
              // e.g. email, phone, ip address, anonymous token, whatever.
              var recipient = messenger.config.recipients.findOne(user);
              if (recipient)
                return recipient._id;
              else
                return messenger.config.recipients.insert(user);
            }
          })
          .value();
        if (users.length === 1)
          message[propertyName] = users[0];
        else
          message[propertyName] = users;
      });
  });

  messenger.router.route('assignThreadId', function (message) {
    if (!message.threadId && messenger.config.threads) {
      var users = _.chain([message.fromId, message.toId])
        .flatten()
        .sortBy(_.identity)
        .value();

      var thread = messenger.config.threads.findOne({
        name: {
          $exists: false
        }
        , participants: {
          $all: users
          , $size: users.length
        }
      });

      if (!thread)
        thread = messenger.config.threads.insert({
          participants: users
        });
      else
        thread = thread._id;

      message.threadId = thread;
    }
  });

  messenger.router.route('mailer', function (message) {
    var mailer = messenger.config.mailer;
    if (mailer) {
      if (_.isFunction(mailer))
        mailer.call(this, message);
      else if (_.isFunction(mailer.send)) {
        mailer.send(message, this.options);
      }
    }
  });

  messenger.router.route('default', 'assignRecipientId', 'assignThreadId', 'mailer');

  return messenger;
};

Meteor.startup(function () {
  if (!Messenger.send)
    Messenger.factory(Messenger, {
      threads: new Mongo.Collection('useful:messenger:threads')
      , recipients: new Mongo.Collection('useful:messenger:recipients')
      , users: Meteor.users
      , mailer: Mailer
    });
});
