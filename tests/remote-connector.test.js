// Copyright IBM Corp. 2014,2019. All Rights Reserved.
// Node module: loopback-connector-remote
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert');
const helper = require('./helper');
const loopback = require('loopback');

describe('RemoteConnector', function() {
  let serverApp, clientApp, ServerModel, ClientModel;

  before(async function() {
    const app = serverApp = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    ServerModel = app.registry.createModel({
      name: 'TestModel',
    });
    app.model(ServerModel, {dataSource: db});

    await new Promise((resolve) => app.locals.handler.on('listening', resolve));

    clientApp = loopback({localRegistry: true});
    const remoteDs = helper.createRemoteDataSource(clientApp, serverApp);

    ClientModel = clientApp.registry.createModel({
      name: 'TestModel',
    });
    clientApp.model(ClientModel, {dataSource: remoteDs});
  });

  after(function() {
    serverApp.locals.handler.close();
    ServerModel = null;
    ClientModel = null;
  });

  it('should support the save method', async function() {
    let calledServerCreate = false;

    ServerModel.create = function(data, options, cb, callback) {
      if (typeof options === 'function') {
        callback = cb;
        cb = options;
      }

      calledServerCreate = true;
      data.id = 1;
      if (callback) callback(null, data);
      else cb(null, data);
    };

    const m = new ClientModel({foo: 'bar'});
    const instance = await m.save();
    assert(instance);
    assert(instance instanceof ClientModel);
    assert(calledServerCreate);
  });

  it('should support aliases', async function() {
    let calledServerUpsert = false;
    ServerModel.patchOrCreate =
    ServerModel.upsert = function(id, options, cb) {
      if (typeof options === 'function') {
        cb = options;
      }

      calledServerUpsert = true;
      cb();
    };

    const instance = await new Promise((resolve, reject) => {
      ClientModel.updateOrCreate({}, (err, u) => err ? reject(err) : resolve(u));
    });
    assert(instance);
    assert(instance instanceof ClientModel);
    assert(calledServerUpsert, 'server upsert should have been called');
  });
});

describe('Custom Path', function() {
  let serverApp, clientApp, ServerModel, ClientModel;

  before(async function() {
    const app = serverApp = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    ServerModel = app.registry.createModel({
      name: 'TestModel',
      options: {
        http: {path: '/custom'},
      },
    });
    app.model(ServerModel, {dataSource: db});

    await new Promise((resolve) => serverApp.locals.handler.on('listening', resolve));

    clientApp = loopback({localRegistry: true});
    const remoteDs = helper.createRemoteDataSource(clientApp, serverApp);

    ClientModel = clientApp.registry.createModel({
      name: 'TestModel',
      options: {
        dataSource: 'remote',
        http: {path: '/custom'},
      },
    });
    clientApp.model(ClientModel, {dataSource: remoteDs});
  });

  after(function() {
    serverApp.locals.handler.close();
    ServerModel = null;
    ClientModel = null;
  });

  it('should support http.path configuration', async function() {
    const instance = await ClientModel.create({});
    assert(instance);
  });
});

describe('ObjectId coercion for string args', function() {
  let serverApp, clientApp, ServerModel, ClientModel;

  before(async function() {
    const app = serverApp = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    ServerModel = app.registry.createModel({name: 'TestModel'});
    ServerModel.endSession = function(machineId, orderId, cb) {
      cb(null, {receivedMachineId: machineId, receivedOrderId: orderId});
    };
    ServerModel.remoteMethod('endSession', {
      accepts: [
        {arg: 'machineId', type: 'string', required: true},
        {arg: 'orderId', type: 'string', required: true},
      ],
      returns: {type: 'object', root: true},
      http: {verb: 'post', path: '/end-session'},
    });
    app.model(ServerModel, {dataSource: db});

    await new Promise((resolve) => app.locals.handler.on('listening', resolve));

    clientApp = loopback({localRegistry: true});
    const remoteDs = helper.createRemoteDataSource(clientApp, serverApp);

    ClientModel = clientApp.registry.createModel({name: 'TestModel'});
    ClientModel.remoteMethod('endSession', {
      accepts: [
        {arg: 'machineId', type: 'string', required: true},
        {arg: 'orderId', type: 'string', required: true},
      ],
      returns: {type: 'object', root: true},
      http: {verb: 'post', path: '/end-session'},
    });
    clientApp.model(ClientModel, {dataSource: remoteDs});
  });

  after(function() {
    serverApp.locals.handler.close();
    ServerModel = null;
    ClientModel = null;
  });

  it('should coerce ObjectId-like args to hex strings for string params', async function() {
    const machineObjectId = {
      toHexString: function() { return '66cd41bc565b9600110e1272'; },
      toString: function() { return '66cd41bc565b9600110e1272'; },
    };
    const orderObjectId = {
      toHexString: function() { return '6a0eb6847bee16983fec880a'; },
      toString: function() { return '6a0eb6847bee16983fec880a'; },
    };

    const result = await new Promise((resolve, reject) => {
      ClientModel.endSession(machineObjectId, orderObjectId, (err, r) => err ? reject(err) : resolve(r));
    });
    assert.strictEqual(result.receivedMachineId, '66cd41bc565b9600110e1272');
    assert.strictEqual(result.receivedOrderId, '6a0eb6847bee16983fec880a');
  });

  it('should pass through plain strings unchanged', async function() {
    const result = await new Promise((resolve, reject) => {
      ClientModel.endSession('plain-mid', 'plain-oid', (err, r) => err ? reject(err) : resolve(r));
    });
    assert.strictEqual(result.receivedMachineId, 'plain-mid');
    assert.strictEqual(result.receivedOrderId, 'plain-oid');
  });

  it('should NOT coerce plain objects (no toHexString) — strong-remoting drops them', async function() {
    // A plain object as a string arg: isAcceptable rejects it, so the body
    // never contains machineId, and the server returns the "required" error.
    const err = await new Promise((resolve) => {
      ClientModel.endSession({foo: 'bar'}, 'oid', (e) => resolve(e));
    });
    assert(err, 'expected validation error');
    assert(/machineId is a required argument/.test(err.message),
      'plain objects should NOT be silently coerced');
  });
});

describe('RemoteConnector with options', () => {
  it('should have the remoting options passed to the remote object', () => {
    const app = loopback();
    const dataSource = app.dataSource('remote', {
      url: 'http://example.com',
      connector: require('..'),
      options: {'test': 'abc'},
    });

    assert.deepEqual(dataSource.connector.remotes.options, {test: 'abc'});
  });
});
