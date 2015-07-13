var tom, dick, harry;

if (Meteor.isServer) {
  Meteor.users.remove({});
  tom = Meteor.users.insert({
    profile: {
      name: 'Tom'
    }
    , emails: [{
      address: 'tom@example.com'
      , verified: true
    }]
  });
  dick = Meteor.users.insert({
    profile: {
      name: 'Dick'
    }
    , emails: [{
      address: 'dick@example.com'
      , verified: true
    }]
  });
  harry = Meteor.users.insert({
    profile: {
      name: 'Harry'
    }
    , emails: [{
      address: 'harry@example.com'
      , verified: true
    }]
  });
  Meteor.publish('users', function () {
    return Meteor.users.find();
  });
} else {
  Meteor.subscribe('users', function () {
    tom = Meteor.users.findOne({"profile.name": 'Tom'})._id;
    dick = Meteor.users.findOne({"profile.name": 'Dick'})._id;
    harry = Meteor.users.findOne({"profile.name": 'Harry'})._id;
  });
}

Tinytest.add('Messenger - assigns a unique threadId to each user combination', function (test) {
  var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads'));

  var fromTomToDick = messenger.send({
    fromId: tom
    , toId: dick
  });
  var fromDickToTom = messenger.send({
    fromId: dick
    , toId: tom
  });
  var fromDickToHarry = messenger.send({
    fromId: dick
    , toId: harry
  });

  test.equal(typeof fromTomToDick.threadId, 'string');
  test.equal(fromTomToDick.threadId, fromDickToTom.threadId);
  test.notEqual(fromTomToDick.threadId, fromDickToHarry.threadId);
});

Tinytest.add('Messenger - assigns a unique threadId to multi user threads', function (test) {
  var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads'));

  var fromTomToDick = messenger.send({
    fromId: tom
    , toId: [dick, harry]
  });
  var fromDickToTom = messenger.send({
    fromId: dick
    , toId: [tom, harry]
  });
  var fromDickToHarry = messenger.send({
    fromId: dick
    , toId: harry
  });

  test.equal(typeof fromTomToDick.threadId, 'string');
  test.equal(fromTomToDick.threadId, fromDickToTom.threadId);
  test.notEqual(fromTomToDick.threadId, fromDickToHarry.threadId);
});

Tinytest.add('Messenger - assigns a unique userId to non-existent users', function (test) {
  var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads', 'recipients'));

  var fromTomToDick = messenger.send({
    fromId: {
      email: 'visitor@example.com'
    }
    , toId: dick
  });
  var fromDickToTom = messenger.send({
    fromId: dick
    , toId: {
      email: 'visitor@example.com'
    }
  });

  test.equal(typeof fromTomToDick.fromId, 'string');
  test.equal(typeof fromDickToTom.toId, 'string');
  test.equal(typeof fromTomToDick.threadId, 'string');
  test.equal(fromTomToDick.threadId, fromDickToTom.threadId);
});

Tinytest.add('Messenger - finds existing userId for existing users', function (test) {
  var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads', 'recipients', 'users'));

  var fromTomToDick = messenger.send({
    fromId: {
      email: 'tom@example.com'
    }
    , toId: dick
  });

  test.equal(fromTomToDick.fromId, tom);
});

Tinytest.add('Messenger - sends messages via mailer', function (test) {
  var sent;
  var messenger = Messenger.factory(null, {
    mailer: Mailer.factory(null, {
      defaultServiceProvider: function (message) {
        sent = message;
      }
    })
  });
  messenger.send({
    fromId: 'test'
    , toId: 'test'
  });
  test.equal(sent, {
    fromId: 'test'
    , toId: 'test'
  });
});

Tinytest.add('Messenger - recieves messages from mailer', function (test) {
  var sent;
  var mailer = Mailer.factory(null, {
    defaultServiceProvider: function (email) {
     sent = email;
    }
  });
  var messenger = Messenger.factory(null, {
    mailer: mailer
    , users: Meteor.users
  });

  var message = {
    from: 'tom@example.com'
    , to: 'dick@example.com'
  };

  mailer.send('recieve', message);

  test.equal(sent.fromId, tom);
  test.equal(sent.toId, dick);
});

Tinytest.add('Messenger - assigns replyTo for emails sent via mailer', function (test) {
  var sent;
  var mailer = Mailer.factory(null, {
    defaultServiceProvider: function (email) {
      sent = email;
    }
    , resolveEmailAddress: Mailer.config.resolveEmailAddress
  });
  var messenger = Messenger.factory(null, _.extend(
    _.pick(
      Messenger.config
      , 'threads'
      , 'users'
    )
    , {
      mailer: mailer
      , outboundDomain: 'example.com'
      , outboundAddress: 'notifications@example.com'
    })
  );

  message = messenger.send({
    fromId: tom
    , toId: dick
  });

  test.equal(sent.from, 'notifications@example.com');
  test.equal(sent.replyTo, message.threadId + '+' + tom + '@example.com');
  test.equal(sent.to, 'dick@example.com');
});

Tinytest.add('Messenger - threading and mailer round trip', function (test) {
  var options = _.clone(Messenger.config);
  options.outboundDomain = 'example.com';
  options.outboundAddress = 'notifications@example.com';
  options.mailer = Mailer.factory(null, {
    defaultServiceProvider: function (email) {
      sent = email;
    }
    , resolveEmailAddress: Mailer.config.resolveEmailAddress
    , resolveAddressName: Mailer.config.resolveAddressName
  });
  var messenger = Messenger.factory(null, options);

  var sent;
  messenger.send({
    fromId: tom
    , toId: dick
  });

  test.equal(sent.from, '"Tom" <notifications@example.com>');
  test.equal(sent.to, '"Dick" <dick@example.com>');
  test.equal(sent.replyTo, sent.threadId + '+' + tom + '@example.com');

  options.mailer.send('recieve', {
    from: sent.to
    , to: sent.replyTo
    , text: 'hi'
  });

  test.equal(sent.from, '"Dick" <notifications@example.com>');
  test.equal(sent.to, '"Tom" <tom@example.com>');
  test.equal(sent.text, 'hi');
});