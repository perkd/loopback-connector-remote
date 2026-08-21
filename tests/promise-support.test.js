// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-remote
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert');
const helper = require('./helper');

let app, User;

describe('promise support', function() {
  before(function() {
    app = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    User = app.registry.createModel({
      name: 'user',
      properties: helper.getUserProperties(),
      options: {forceId: false},
    });
    app.model(User, {dataSource: db});
  });

  after(function() {
    app.locals.handler.close();
  });

  describe('create', function() {
    it('supports promises', function() {
      const retval = User.create();
      assert(retval && typeof retval.then === 'function');
    });
  });

  describe('find', function() {
    it('supports promises', function() {
      const retval = User.find();
      assert(retval && typeof retval.then === 'function');
    });
  });

  describe('findById', function() {
    it('supports promises', function() {
      const retval = User.findById(1);
      assert(retval && typeof retval.then === 'function');
    });
  });
});
