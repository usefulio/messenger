Messenger = function () {
  this.notifications = {};
  this.actions = {};
};

Messenger.prototype.addNotification = function (routeName, action) {
  if (_.isString(action)) {
    action = (function (action) {
      return function (message) {
        return this.send(action, message);
      };
    })(action);
  }

  this.notifications[routeName] = this.notifications[routeName] || [];
  this.notifications[routeName].push(action);
};

Messenger.prototype.addAction = function (routeName, action) {
  if (_.isString(action)) {
    action = (function (action) {
      return function (message) {
        return this.send(action, message);
      };
    })(action);
  }

  this.actions[routeName] = this.actions[routeName] || [];
  this.actions[routeName].push(action);
};

Messenger.prototype.send = function (routes, message) {
  var self = this;

  if (_.isString(routes))
    routes = [routes];
  if (_.isObject(routes) && !_.isArray(routes) && !message) {
    message = routes;
    routes = null;
  }
  if (!_.isObject(message))
    throw new Error('invalid message, should be an object');
  if (routes && !_.isArray(routes))
    throw new Error('invalide routes, should be an array or a string');

  routes = routes || message.routes || ['default'];

  message.routes = message.routes || routes;

  _.each(routes, function (route) {
    if (!_.isString(route))
      throw new Error('invalid route, should be a string');
    var actions = self.actions[route] || [];
    _.each(actions, function (action) {
      var result = action.call(self, message);
      if (_.isObject(result))
        message = result;
    });
    var notifications = self.notifications[route] || [];
    _.each(notifications, function (action) {
      var result = action.call(self, message);
      if (_.isObject(result))
        message = result;
    });
  });

  return message;
};

Messenger.config = {};

Meteor.startup(function () {
  if (Messenger.config.doNotInit)
    return;

  _.extend(Messenger, new Messenger());

  Messenger.messages = new Mongo.Collection('useful:messenger:messages');
  Messenger.threads = new Mongo.Collection('useful:messenger:threads');
  Messenger.recipients = new Mongo.Collection('useful:messenger:recipients');

  Messenger.parseAddress = function (email) {
    var name = /"([^"]+)"/.exec(email);
    var address = /<([^>]+)>/.exec(email);
    if (address)
      address = address[1];
    else
      address = email;

    name = name && name[1];

    var thread = /([^+]+)\+/.exec(address);
    var recipient = /\+([^+]+)@/.exec(address);
    thread = thread && thread[1];
    recipient = recipient && recipient[1];
    return {
      email: address
      , name: name
      , thread: thread
      , recipient: recipient
    };
  };

  Messenger.getUser = function (userIdentifier) {
    var isEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(userIdentifier);

    var user;

    if (Meteor.users)
     user = Meteor.users.findOne(userIdentifier);
    if (!user)
      user = this.recipients.findOne(userIdentifier);

    if (isEmail) {
      if (!user && Meteor.users)
        user = Meteor.users.findOne({
          "emails.address": userIdentifier
        });
      if (!user)
        user = this.recipients.findOne({
          "emails.address": userIdentifier
        });
      if (!user) {
        user = {
          _id: this.recipients.insert({
            emails: [{address: userIdentifier}]
          })
        };
      }
    }

    return user && user._id;
  };

  Messenger.prettifyEmail = function (name, address) {
    if (_.isString(name)) {
      return '"' + name.replace(/[^a-z0-9!#$%&'*+\-\/=?\^_`{|}~ ]/ig, "") + '" <' + address + '>';
    } else {
      return address;
    }
  };

  Messenger.getParsedReply = function (text) {
    if (typeof EmailReplyParser !== 'undefined')
      return EmailReplyParser.parse_reply(text.replace(">\nwrote:", "> wrote:"));
    else
      return text;
  };

  Messenger.getEmail = function (userId, kind, email) {
    var user;

    if (Meteor.users)
      user = Meteor.users.findOne(userId);
    if (!user)
      user = this.recipients.findOne(userId);
    
    var name = user && user.profile && user.profile.name;
    var address = user && _.first(user.emails).address;

    if (kind === 'from' && this.config.outboundAddress) {
      address = this.config.outboundAddress;
    } else if (kind === 'replyTo' && this.config.inboundDomain) {
      address = email.thread + '+' + user._id + '@' + this.config.inboundDomain;
    }

    return this.prettifyEmail(name, address);
  };

  Messenger.addAction('default', function (message) {
    message.from = this.getUser(message.from);
    message.to = this.getUser(message.to);
  });

  Messenger.addAction('default', function (message) {
    var participants = _.sortBy([message.from, message.to], _.identity);

    var thread;

    if (_.isString(message.thread))
      thread = this.threads.findOne(message.thread);
    
    if (!thread && message.thread)
      thread = this.threads.findOne({
        identity: message.thread
      });

    if (!thread && message.thread) {
      thread = {
        _id: this.threads.insert({
          identity: message.thread
          , participants: participants
        })
      };
    }

    if (!thread) {
      thread = this.threads.findOne({
        participants: {
          $all: participants
          , $size: participants.length
        }
        , isAnonymous: true
      });
    }

    if (!thread) {
      thread = {
        _id: this.threads.insert({
          participants: participants
          , isAnonymous: true
        })
      };
    }

    message.thread = thread._id;
  });

  Messenger.addAction('default', function (message) {
    var thread = this.threads.findOne(message.thread);
    if (thread && thread.identity)
      console.log(_.extend(message, thread.identity));
  });

  Messenger.addAction('default', function (message) {
    message.sentAt = new Date();
  });

  Messenger.addNotification('default', function (message) {
    var id = this.messages.insert(message);
    return this.messages.findOne(id);
  });

  var Mailer = Package['useful:mailer'].Mailer;
  if (Mailer && Messenger.config.mailer !== null) {
    console.log('messenger: initializing mailer');

    var config = _.defaults(Messenger.config.mailer || {}, {
      mailer: Mailer
      , route: 'default'
    });

    Messenger.addNotification('default', function (message) {
      console.log('outbound message to:', message.to, 'subject:',  message.subject);
      var options = _.defaults({
        from: this.getEmail(message.from, 'from', message)
        , to: this.getEmail(message.to)
        , replyTo: this.getEmail(message.from, 'replyTo', message)
        , fromId: message.from
        , toId: message.to
        , subject: message.subject
        , subjectTemplate: message.subjectTemplate
        , template: message.template
        , layoutTemplate: message.layoutTemplate
        , text: message.text
      }, message);
      var email = config.mailer.send(config.route, options);

      if (message._id && email)
        this.messages.update(message._id, {
          $push: {
            notifications: {
              email: email._id
            }
          }
        });

      return this.messages.findOne(message._id);
    });

    config.mailer.router.route('inbound/message', function (email) {
      Messenger.send('inbound/email', email);
    });

    config.mailer.config.threading = config.mailer.config.threading || {};
    config.mailer.config.threading.onRecieveRoute = 'inbound/message';
  }

  Messenger.addAction('inbound/email', function (email) {
    console.log('inbound message from:' + email.from + " subject:" + email.subject);

    var recipientDetails = this.parseAddress(email.to);
    var senderDetails = this.parseAddress(email.from);
    return {
      from: this.getUser(senderDetails && senderDetails.email)
      , to: this.getUser(recipientDetails && recipientDetails.recipient)
      , thread: recipientDetails.thread
      , subject: email.subject
      , text: this.getParsedReply(email.text || '')
      , html: email.html
      , original: _.pick(email, 'from', 'to', 'subject', 'text', 'html')
    };
  });

  Messenger.addNotification('inbound/email', 'default');
});