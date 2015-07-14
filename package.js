Package.describe({
  name: 'useful:messenger',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
  'emailreplyparser': '0.0.5'
});

Package.onUse(function(api) {
  api.versionsFrom('1.1.0.2');
  api.use('useful:mailer');
  api.use('underscore');
  api.use('accounts-base');

  api.addFiles('messenger.js');

  api.export('Messenger');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('useful:messenger');
  api.use('useful:mailer');
  api.use('accounts-base');
  api.addFiles('messenger-tests.js');
});
