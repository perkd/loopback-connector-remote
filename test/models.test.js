// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-remote
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert');
const helper = require('./helper');
const TaskEmitter = require('strong-task-emitter');

describe('Model tests', function() {
  let app, User;

  beforeEach(function() {
    app = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    User = app.registry.createModel({
      name: 'user',
      properties: helper.getUserProperties(),
      options: {forceId: false},
    });
    app.model(User, {dataSource: db});
  });

  afterEach(function() {
    app.locals.handler.close();
  });

  describe('Model.validatesPresenceOf(properties...)', function() {
    it('should require a model to include a property to be considered valid',
      function() {
        User.validatesPresenceOf('first', 'last', 'age');
        const joe = new User({first: 'joe'});
        assert(joe.isValid() === false, 'model should not validate');
        assert(joe.errors.last, 'should have a missing last error');
        assert(joe.errors.age, 'should have a missing age error');
      });
  });

  describe('Model.validatesLengthOf(property, options)', function() {
    it('should require a property length to be within a specified range',
      function() {
        User.validatesLengthOf('password', {min: 5, message: {min:
          'Password is too short'}});
        const joe = new User({password: '1234'});
        assert(joe.isValid() === false, 'model should not be valid');
        assert(joe.errors.password, 'should have password error');
      });
  });

  describe('Model.validatesInclusionOf(property, options)', function() {
    it('should require a value for `property` to be in the specified array',
      function() {
        User.validatesInclusionOf('gender', {in: ['male', 'female']});
        const foo = new User({gender: 'bar'});
        assert(foo.isValid() === false, 'model should not be valid');
        assert(foo.errors.gender, 'should have gender error');
      });
  });

  describe('Model.validatesExclusionOf(property, options)', function() {
    it('should require a value for `property` to not exist in the specified ' +
        'array', function() {
      User.validatesExclusionOf('domain', {in: ['www', 'billing', 'admin']});
      const foo = new User({domain: 'www'});
      const bar = new User({domain: 'billing'});
      const bat = new User({domain: 'admin'});
      assert(foo.isValid() === false);
      assert(bar.isValid() === false);
      assert(bat.isValid() === false);
      assert(foo.errors.domain, 'model should have a domain error');
      assert(bat.errors.domain, 'model should have a domain error');
    });
  });

  describe('Model.validatesNumericalityOf(property, options)', function() {
    it('should require a value for `property` to be a specific type of ' +
        '`Number`', function() {
      User.validatesNumericalityOf('age', {int: true});
      const joe = new User({age: 10.2});
      assert(joe.isValid() === false);
      const bob = new User({age: 0});
      assert(bob.isValid() === true);
      assert(joe.errors.age, 'model should have an age error');
    });
  });

  describe('myModel.isValid()', function() {
    it('should validate the model instance', function() {
      User.validatesNumericalityOf('age', {int: true});
      const user = new User({first: 'joe', age: 'flarg'});
      const valid = user.isValid();
      assert(valid === false);
      assert(user.errors.age, 'model should have age error');
    });

    it('should validate the model asynchronously', async function() {
      User.validatesNumericalityOf('age', {int: true});
      const user = new User({first: 'joe', age: 'flarg'});
      const valid = await new Promise((resolve) => user.isValid(resolve));
      assert(valid === false);
      assert(user.errors.age, 'model should have age error');
    });
  });

  describe('Model.create([data], [callback])', function() {
    it('should create an instance and save to the attached data source',
      async function() {
        const user = await User.create({first: 'Joe', last: 'Bob'});
        assert(user instanceof User);
      });
  });

  describe('model.save([options], [callback])', function() {
    it('should save an instance of a Model to the attached data source',
      async function() {
        const joe = new User({first: 'Joe', last: 'Bob'});
        const user = await joe.save();
        assert(user.id);
        assert(!user.errors);
      });
  });

  describe('model.updateAttributes(data, [callback])', function() {
    it('should save specified attributes to the attached data source',
      async function() {
        const user = await User.create({first: 'joe', age: 100});
        assert.equal(user.first, 'joe');

        const updatedUser = await new Promise((resolve, reject) => {
          user.updateAttributes({
            first: 'updatedFirst',
            last: 'updatedLast',
          }, (err, u) => err ? reject(err) : resolve(u));
        });
        assert.equal(updatedUser.first, 'updatedFirst');
        assert.equal(updatedUser.last, 'updatedLast');
        assert.equal(updatedUser.age, 100);
      });
  });

  describe('Model.upsert(data, callback)', function() {
    it('should update when a record with id=data.id is found, insert otherwise',
      async function() {
        const user = await new Promise((resolve, reject) => {
          User.upsert({first: 'joe', id: 7}, (err, u) => err ? reject(err) : resolve(u));
        });
        assert.equal(user.first, 'joe');

        const updatedUser = await new Promise((resolve, reject) => {
          User.upsert({first: 'bob', id: 7}, (err, u) => err ? reject(err) : resolve(u));
        });
        assert.equal(updatedUser.first, 'bob');
      });
  });

  describe('model.destroy([callback])', function() {
    it('should remove a model from the attached data source', async function() {
      const user = await User.create({first: 'joe', last: 'bob'});
      const foundUser = await User.findById(user.id);
      assert.equal(user.id, foundUser.id);
      await new Promise((resolve, reject) => {
        foundUser.destroy((err) => err ? reject(err) : resolve());
      });
      const notFound = await User.findById(user.id);
      assert.equal(notFound, null);
    });
  });

  describe('Model.deleteById(id, [callback])', function() {
    it('should delete a model instance from the attached data source',
      async function() {
        const user = await User.create({first: 'joe', last: 'bob'});
        await new Promise((resolve, reject) => {
          User.deleteById(user.id, (err) => err ? reject(err) : resolve());
        });
        const notFound = await User.findById(user.id);
        assert.equal(notFound, null);
      });
  });

  describe('Model.findById(id, callback)', function() {
    it('should find an instance by id', async function() {
      await User.create({first: 'michael', last: 'jordan', id: 23});
      const user = await User.findById(23);
      assert(user, 'user should have been found');
      assert.equal(user.id, 23);
      assert.equal(user.first, 'michael');
      assert.equal(user.last, 'jordan');
    });
  });

  describe('Model.count([query], callback)', function() {
    it('should return the count of Model instances in data source',
      async function() {
        await new Promise((resolve, reject) => {
          const taskEmitter = new TaskEmitter();
          taskEmitter
            .task(User, 'create', {first: 'jill', age: 100})
            .task(User, 'create', {first: 'bob', age: 200})
            .task(User, 'create', {first: 'jan'})
            .task(User, 'create', {first: 'sam'})
            .task(User, 'create', {first: 'suzy'})
            .on('done', resolve)
            .on('error', reject);
        });
        const count = await new Promise((resolve, reject) => {
          User.count({age: {gt: 99}}, (err, c) => err ? reject(err) : resolve(c));
        });
        assert.equal(count, 2);
      });
  });
});
