// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-remote
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert');
const helper = require('./helper');
const loopback = require('loopback');
const TaskEmitter = require('strong-task-emitter');

describe('Remote model tests', function() {
  let serverApp, ServerModel, ServerRelatedModel, ServerModelWithSingleChild,
    clientApp, ClientModel, ClientRelatedModel, ClientModelWithSingleChild;

  beforeEach(async function() {
    const app = serverApp = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    ServerModel = app.registry.createModel({
      name: 'TestModel',
      properties: helper.getUserProperties(),
      options: {
        forceId: false,
        relations: {
          children: {
            type: 'hasMany',
            model: 'ChildModel',
            foreignKey: 'parentId',
          },
        },
      },
    });

    ServerModelWithSingleChild = app.registry.createModel({
      name: 'TestModelWithSingleChild',
      properties: helper.getUserProperties(),
      options: {
        forceId: false,
        relations: {
          child: {
            type: 'hasOne',
            model: 'ChildModel',
            foreignKey: 'parentId',
          },
        },
      },
    });

    ServerRelatedModel = app.registry.createModel({
      name: 'ChildModel',
      properties: {
        note: {type: 'text'},
        parentId: {type: 'number'},
      },
      options: {forceId: false},
    });

    app.model(ServerModel, {dataSource: db});
    app.model(ServerRelatedModel, {dataSource: db});
    app.model(ServerModelWithSingleChild, {dataSource: db});

    await new Promise((resolve) => serverApp.locals.handler.on('listening', resolve));

    clientApp = loopback({localRegistry: true});
    const remoteDs = helper.createRemoteDataSource(clientApp, serverApp);

    ClientRelatedModel = clientApp.registry.createModel({
      name: 'ChildModel',
      properties: {
        note: {type: 'text'},
        parentId: {type: 'number'},
      },
      options: {
        strict: true,
      },
    });

    ClientModel = clientApp.registry.createModel({
      name: 'TestModel',
      properties: helper.getUserProperties(),
      options: {
        relations: {
          children: {
            type: 'hasMany',
            model: 'ChildModel',
            foreignKey: 'parentId',
          },
        },
        strict: true,
      },
    });

    ClientModelWithSingleChild = clientApp.registry.createModel({
      name: 'TestModelWithSingleChild',
      properties: helper.getUserProperties(),
      options: {
        relations: {
          child: {
            type: 'hasOne',
            model: 'ChildModel',
            foreignKey: 'parentId',
          },
        },
        strict: true,
      },
    });

    clientApp.model(ClientModel, {dataSource: remoteDs});
    clientApp.model(ClientRelatedModel, {dataSource: remoteDs});
    clientApp.model(ClientModelWithSingleChild, {dataSource: remoteDs});
  });

  afterEach(function() {
    serverApp.locals.handler.close();
    ServerModel = null;
    ServerRelatedModel = null;
    ClientModel = null;
  });

  describe('Model.create([data], [callback])', function() {
    it('should create an instance and save to the attached data source',
      async function() {
        const user = await ClientModel.create({first: 'Joe', last: 'Bob'});
        assert(user instanceof ClientModel);
      });
  });

  describe('model.save([options], [callback])', function() {
    it('should save an instance of a Model to the attached data source',
      async function() {
        const joe = new ClientModel({first: 'Joe', last: 'Bob'});
        const user = await joe.save();
        assert(user.id);
        assert(!user.errors);
      });
  });

  describe('model.updateAttributes(data, [callback])', function() {
    it('should save specified attributes to the attached data source',
      async function() {
        const user = await ServerModel.create({first: 'joe', age: 100});
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
        const user = await ClientModel.upsert({first: 'joe', id: 7});
        assert.equal(user.first, 'joe');

        const updatedUser = await ClientModel.upsert({first: 'bob', id: 7});
        assert.equal(updatedUser.first, 'bob');
      });
  });

  describe('Model.deleteById(id, [callback])', function() {
    it('should delete a model instance from the attached data source',
      async function() {
        const user = await ServerModel.create({first: 'joe', last: 'bob'});
        await ClientModel.deleteById(user.id);
        const notFound = await ClientModel.findById(user.id);
        assert.equal(notFound, null);
      });
  });

  describe('Model.exists(id, callback)', function() {
    it('should return true when the model with the given id exists',
      async function() {
        const user = await ServerModel.create({first: 'max'});
        const exist = await ClientModel.exists(user.id);
        assert.equal(exist, true);
      });

    it('should return false when there is no model with the given id',
      async function() {
        const exist = await ClientModel.exists('user-id-does-not-exist');
        assert.equal(exist, false);
      });
  });

  describe('Model.findById(id, callback)', function() {
    it('should return null when an instance does not exist', async function() {
      const notFound = await ClientModel.findById(23);
      assert.equal(notFound, null);
    });

    it('should find an instance by id from the attached data source',
      async function() {
        await ServerModel.create({first: 'michael', last: 'jordan', id: 23});
        const user = await ClientModel.findById(23);
        assert.equal(user.id, 23);
        assert.equal(user.first, 'michael');
        assert.equal(user.last, 'jordan');
      });
  });

  describe('Model.findOne([filter], callback)', function() {
    it('should return null when an instance does not exist', async function() {
      const notFound = await ClientModel.findOne({where: {id: 24}});
      assert.equal(notFound, null);
    });

    it('should find an instance from the attached data source',
      async function() {
        await ServerModel.create({first: 'keanu', last: 'reeves', id: 24});
        const user = await ClientModel.findOne({where: {id: 24}});
        assert.equal(user.id, 24);
        assert.equal(user.first, 'keanu');
        assert.equal(user.last, 'reeves');
      });
  });

  describe('Model.count([query], callback)', function() {
    it('should return the count of Model instances from both data source',
      async function() {
        await new Promise((resolve, reject) => {
          const taskEmitter = new TaskEmitter();
          taskEmitter
            .task(ServerModel, 'create', {first: 'jill', age: 100})
            .task(ClientModel, 'create', {first: 'bob', age: 200})
            .task(ClientModel, 'create', {first: 'jan'})
            .task(ServerModel, 'create', {first: 'sam'})
            .task(ServerModel, 'create', {first: 'suzy'})
            .on('done', (err) => err ? reject(err) : resolve())
            .on('error', reject);
        });
        const count = await ClientModel.count({age: {gt: 99}});
        assert.equal(count, 2);
      });
  });

  describe('Model find with include filter', function() {
    let hasManyParent, hasManyChild, hasOneParent, hasOneChild;

    beforeEach(async function() {
      hasManyParent = await ServerModel.create({first: 'eiste', last: 'kopries'});
      hasManyChild = await ServerRelatedModel.create({
        note: 'mitsos',
        parentId: hasManyParent.id,
        id: 11,
      });
      hasOneParent = await ServerModelWithSingleChild.create({
        first: 'mipos',
        last: 'tora',
        id: 12,
      });
      hasOneChild = await ServerRelatedModel.create({
        note: 'mitsos3',
        parentId: hasOneParent.id,
        id: 13,
      });
    });

    it('should return also the included requested  models', async function() {
      const parentId = hasManyParent.id;
      const returnedUser = await ClientModel.findById(parentId, {include: 'children'});
      assert(returnedUser instanceof ClientModel);
      const user = returnedUser.toJSON();
      assert.equal(user.id, parentId);
      assert.equal(user.first, hasManyParent.first);
      assert(Array.isArray(user.children));
      assert.equal(user.children.length, 1);
      assert.deepEqual(user.children[0], hasManyChild.toJSON());
    });

    it('should return cachedRelated entity without call', async function() {
      const parentId = hasManyParent.id;
      const returnedUser = await ClientModel.findById(parentId, {include: 'children'});
      assert(returnedUser instanceof ClientModel);
      const children = returnedUser.children();
      assert.equal(returnedUser.id, parentId);
      assert.equal(returnedUser.first, hasManyParent.first);
      assert(Array.isArray(children));
      assert.equal(children.length, 1);
      assert(children[0] instanceof ClientRelatedModel);
      assert.deepEqual(children[0].toJSON(), hasManyChild.toJSON());
    });

    it('should also work for single (non array) relations', async function() {
      const parentId = hasOneParent.id;
      const returnedUser = await ClientModelWithSingleChild.findById(parentId, {include: 'child'});
      assert(returnedUser instanceof ClientModelWithSingleChild);
      const child = returnedUser.child();
      assert.equal(returnedUser.id, parentId);
      assert.equal(returnedUser.first, hasOneParent.first);
      assert(child instanceof ClientRelatedModel);
      assert.deepEqual(child.toJSON(), hasOneChild.toJSON());
    });
  });

  describe('Model.updateAll([where], [data])', () => {
    it('returns the count of updated instances in data source', async () => {
      await ServerModel.create({first: 'baby', age: 1});
      await ServerModel.create({first: 'grandma', age: 80});

      const result = await ClientModel.updateAll(
        {age: {lt: 6}},
        {last: 'young'},
      );
      assert.deepEqual(result, {count: 1});
    });
  });
});
