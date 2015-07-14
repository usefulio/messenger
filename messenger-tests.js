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

Tinytest.add('Messenger - send - should send a message via the default route', function (test) {
  var messenger = new Messenger();
  var email;
  messenger.addNotification('default', function (message) {
    email = message;
  });

  messenger.send({
    from: tom
    , to: dick
  });

  test.equal(email, {
    from: tom
    , to: dick
    , routes: ['default']
  });
});

Tinytest.add('Messenger - send - should return the sent message', function (test) {
  var messenger = new Messenger();
  var email = messenger.send({
    from: tom
    , to: dick
  });

  test.equal(email, {
    from: tom
    , to: dick
    , routes: ['default']
  });
});

Tinytest.add('Messenger - send - later routes should recieve modified message from earlier routes', function (test) {
  var messenger = new Messenger();
  var email;
  messenger.addNotification('default', function (message) {
    message.done = true;
  });
  messenger.addNotification('default', function (message) {
    return _.extend({
      finished: true
    }, message);
  });
  messenger.addNotification('default', function (message) {
    email = message;
  });

  messenger.send({
    from: tom
    , to: dick
  });

  test.equal(email, {
    from: tom
    , to: dick
    , done: true
    , finished: true
    , routes: ['default']
  });
});

Tinytest.add('Messenger - send - actions should run before notifications', function (test) {
  var messenger = new Messenger();
  messenger.addAction('default', function (message) {
    message.done = false;
  });
  messenger.addNotification('default', function (message) {
    message.done = true;
  });

  var email = messenger.send({
    from: tom
    , to: dick
  });

  test.equal(email, {
    from: tom
    , to: dick
    , done: true
    , routes: ['default']
  });
});

Tinytest.add('Messenger - addNotification - should accept a named route', function (test) {
  var messenger = new Messenger();
  var email;
  messenger.addNotification('done', function (message) {
    message.done = true;
  });
  messenger.addNotification('default', 'done');
  messenger.addNotification('default', function (message) {
    email = message;
  });

  messenger.send({
    from: tom
    , to: dick
  });

  test.equal(email, {
    from: tom
    , to: dick
    , done: true
    , routes: ['default']
  });
});

Tinytest.add('Messenger - global instance - should send messages with a from and to', function (test) {
  var message = Messenger.send({
    from: tom
    , to: dick
  });

  test.equal(message.from, tom);
  test.equal(message.to, dick);
});

Tinytest.add('Messenger - global instance - should store message in the messages collection', function (test) {
  var message = Messenger.send({
    from: tom
    , to: dick
  });

  var record = Messenger.messages.findOne(message._id);

  test.equal(record, message);
});

Tinytest.add('Messenger - global instance - should replace email addresses with the users id', function (test) {
  var message = Messenger.send({
    from: "tom@example.com"
    , to: "dick@example.com"
  });

  test.equal(message.from, tom);
  test.equal(message.to, dick);
});

Tinytest.add('Messenger - global instance - should assign a thread to each message', function (test) {
  var fromTomToDick = Messenger.send({
    from: tom
    , to: dick
  });
  var fromDickToTom = Messenger.send({
    from: dick
    , to: tom
  });
  var fromDickToHarry = Messenger.send({
    from: dick
    , to: harry
  });

  test.equal(typeof fromTomToDick.thread, 'string');
  test.equal(fromTomToDick.thread, fromDickToTom.thread);
  test.notEqual(fromTomToDick.thread, fromDickToHarry.thread);
});

Tinytest.add('Messenger - global instance - should support named threads', function (test) {
  var fromTomToDick = Messenger.send({
    from: tom
    , to: dick
    , thread: {
      name: 'thread'
    }
  });
  var fromDickToTom = Messenger.send({
    from: dick
    , to: tom
    , thread: {
      name: 'thread'  
    }
  });

  test.equal(typeof fromTomToDick.thread, 'string');
  test.equal(fromTomToDick.thread, fromDickToTom.thread);
});

Tinytest.add('Messenger - global instance - should create userId for anonymous users', function (test) {
  var message = Messenger.send({
    from: "visitor@example.com"
    , to: "guest@example.com"
  });
  var secondMessage = Messenger.send({
    from: "visitor@example.com"
    , to: "guest@example.com"
  });

  test.equal(typeof message.from, 'string');
  test.equal(typeof message.to, 'string');
  test.equal(message.from, secondMessage.from);
  test.equal(message.to, secondMessage.to);
  test.notEqual(message.from, 'visitor@example.com');
  test.notEqual(message.to, 'guest@example.com');
  test.equal(message.thread, secondMessage.thread);
});

var lastMailedMessage;

Messenger.config.mailer = {
  mailer: Mailer.factory(null, {
    defaultServiceProvider: function (email) {
      email._id = Random.id();
      lastMailedMessage = email;
    }
  })
};

Messenger.config.outboundAddress = 'notifications@example.com';
Messenger.config.inboundDomain = 'example.com';



Tinytest.add('Messenger - global instance - should send emails', function (test) {
  var message = Messenger.send({
    from: tom
    , to: dick
  });

  test.equal(lastMailedMessage._id, message.notifications[0].email);
});

Tinytest.add('Messenger - global instance - should set addresses on sent emails', function (test) {
  var message = Messenger.send({
    from: tom
    , to: dick
  });

  test.equal(lastMailedMessage.from, '"Tom" <notifications@example.com>');
  test.equal(lastMailedMessage.to, '"Dick" <dick@example.com>');
  test.equal(lastMailedMessage.replyTo, '"Tom" <' + message.thread + '+' + tom + '@example.com>');
});

Tinytest.add('Messenger - global instance - should accept messages at the inbound/email route', function (test) {
  var message = Messenger.send({
    from: tom
    , to: dick
  });
  message = Messenger.send('inbound/email', {
    from: '"Dick" <dick@example.com>'
    , to: '"Tom" <' + message.thread + '+' + tom + '@example.com>'
  });

  test.equal(lastMailedMessage.from, '"Dick" <notifications@example.com>');
  test.equal(lastMailedMessage.to, '"Tom" <tom@example.com>');
  test.equal(lastMailedMessage.replyTo, '"Dick" <' + message.thread + '+' + dick + '@example.com>');
});

Tinytest.add('Messenger - global instance - should attach itself to the mailer inbound route', function (test) {
  var thread = Messenger.send({
    from: tom
    , to: dick
  }).thread;
  Messenger.config.mailer.mailer.send('recieve', {
    from: '"Dick" <dick@example.com>'
    , to: '"Tom" <' + thread + '+' + tom + '@example.com>'
  });

  test.equal(lastMailedMessage.from, '"Dick" <notifications@example.com>');
  test.equal(lastMailedMessage.to, '"Tom" <tom@example.com>');
  test.equal(lastMailedMessage.replyTo, '"Dick" <' + thread + '+' + dick + '@example.com>');
});

Tinytest.add('Messenger - global instance - should attach thread metadata to messages', function (test) {
  var message = Messenger.send({
    from: tom
    , to: dick
    , thread: {
      name: 'name'
    }
  });

  test.equal(message.name, 'name');
});

// Tinytest.add('Messenger - global instance - should parse text part of inbound emails', function (test) {
//   var message = Messenger.send({
//     from: tom
//     , to: dick
//   });
//   message = Messenger.send('inbound/email', {
//     from: '"Dick" <dick@example.com>'
//     , to: '"Tom" <' + message.thread + '+' + tom + '@example.com>'
//     , text: ''
//   });

//   test.equal(lastMailedMessage.from, '"Dick" <notifications@example.com>');
//   test.equal(lastMailedMessage.to, '"Tom" <tom@example.com>');
//   test.equal(lastMailedMessage.replyTo, '"Dick" <' + message.thread + '+' + dick + '@example.com>');
// });




// Tinytest.add('Messenger - assigns a unique thread to each user combination', function (test) {
//   var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads'));

//   var fromTomToDick = messenger.send({
//     fromId: tom
//     , toId: dick
//   });
//   var fromDickToTom = messenger.send({
//     fromId: dick
//     , toId: tom
//   });
//   var fromDickToHarry = messenger.send({
//     fromId: dick
//     , toId: harry
//   });

//   test.equal(typeof fromTomToDick.thread, 'string');
//   test.equal(fromTomToDick.thread, fromDickToTom.thread);
//   test.notEqual(fromTomToDick.thread, fromDickToHarry.thread);
// });

// Tinytest.add('Messenger - assigns a unique thread to multi user threads', function (test) {
//   var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads'));

//   var fromTomToDick = messenger.send({
//     fromId: tom
//     , toId: [dick, harry]
//   });
//   var fromDickToTom = messenger.send({
//     fromId: dick
//     , toId: [tom, harry]
//   });
//   var fromDickToHarry = messenger.send({
//     fromId: dick
//     , toId: harry
//   });

//   test.equal(typeof fromTomToDick.thread, 'string');
//   test.equal(fromTomToDick.thread, fromDickToTom.thread);
//   test.notEqual(fromTomToDick.thread, fromDickToHarry.thread);
// });

// Tinytest.add('Messenger - assigns a unique userId to non-existent users', function (test) {
//   var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads', 'recipients'));

//   var fromTomToDick = messenger.send({
//     fromId: {
//       email: 'visitor@example.com'
//     }
//     , toId: dick
//   });
//   var fromDickToTom = messenger.send({
//     fromId: dick
//     , toId: {
//       email: 'visitor@example.com'
//     }
//   });

//   test.equal(typeof fromTomToDick.fromId, 'string');
//   test.equal(typeof fromDickToTom.toId, 'string');
//   test.equal(typeof fromTomToDick.thread, 'string');
//   test.equal(fromTomToDick.thread, fromDickToTom.thread);
// });

// Tinytest.add('Messenger - finds existing userId for existing users', function (test) {
//   var messenger = Messenger.factory(null, _.pick(Messenger.config, 'threads', 'recipients', 'users'));

//   var fromTomToDick = messenger.send({
//     fromId: {
//       email: 'tom@example.com'
//     }
//     , toId: dick
//   });

//   test.equal(fromTomToDick.fromId, tom);
// });

// Tinytest.add('Messenger - sends messages via mailer', function (test) {
//   var sent;
//   var messenger = Messenger.factory(null, {
//     mailer: Mailer.factory(null, {
//       defaultServiceProvider: function (message) {
//         sent = message;
//       }
//     })
//   });
//   messenger.send({
//     fromId: 'test'
//     , toId: 'test'
//   });
//   test.equal(sent, {
//     fromId: 'test'
//     , toId: 'test'
//   });
// });

// Tinytest.add('Messenger - recieves messages from mailer', function (test) {
//   var sent;
//   var mailer = Mailer.factory(null, {
//     defaultServiceProvider: function (email) {
//      sent = email;
//     }
//   });
//   var messenger = Messenger.factory(null, {
//     mailer: mailer
//     , users: Meteor.users
//   });

//   var message = {
//     from: 'tom@example.com'
//     , to: 'dick@example.com'
//   };

//   mailer.send('recieve', message);

//   test.equal(sent.fromId, tom);
//   test.equal(sent.toId, dick);
// });

// Tinytest.add('Messenger - assigns replyTo for emails sent via mailer', function (test) {
//   var sent;
//   var mailer = Mailer.factory(null, {
//     defaultServiceProvider: function (email) {
//       sent = email;
//     }
//     , resolveEmailAddress: Mailer.config.resolveEmailAddress
//   });
//   var messenger = Messenger.factory(null, _.extend(
//     _.pick(
//       Messenger.config
//       , 'threads'
//       , 'users'
//     )
//     , {
//       mailer: mailer
//       , outboundDomain: 'example.com'
//       , outboundAddress: 'notifications@example.com'
//     })
//   );

//   message = messenger.send({
//     fromId: tom
//     , toId: dick
//   });

//   test.equal(sent.from, 'notifications@example.com');
//   test.equal(sent.replyTo, message.thread + '+' + tom + '@example.com');
//   test.equal(sent.to, 'dick@example.com');
// });

// Tinytest.add('Messenger - threading and mailer round trip', function (test) {
//   var options = _.clone(Messenger.config);
//   options.outboundDomain = 'example.com';
//   options.outboundAddress = 'notifications@example.com';
//   options.mailer = Mailer.factory(null, {
//     defaultServiceProvider: function (email) {
//       sent = email;
//     }
//     , resolveEmailAddress: Mailer.config.resolveEmailAddress
//     , resolveAddressName: Mailer.config.resolveAddressName
//   });
//   var messenger = Messenger.factory(null, options);

//   var sent;
//   messenger.send({
//     fromId: tom
//     , toId: dick
//   });

//   test.equal(sent.from, '"Tom" <notifications@example.com>');
//   test.equal(sent.to, '"Dick" <dick@example.com>');
//   test.equal(sent.replyTo, sent.thread + '+' + tom + '@example.com');

//   options.mailer.send('recieve', {
//     from: sent.to
//     , to: sent.replyTo
//     , text: 'hi'
//   });

//   test.equal(sent.from, '"Dick" <notifications@example.com>');
//   test.equal(sent.to, '"Tom" <tom@example.com>');
//   test.equal(sent.text, 'hi');
// });