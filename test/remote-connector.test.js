// Copyright IBM Corp. 2014,2019. All Rights Reserved.
// Node module: loopback-connector-remote
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('assert');
const helper = require('./helper');
const loopback = require('loopback');

describe('RemoteConnector', function() {
  let serverApp, clientApp, ServerModel, ClientModel;

  before(function setupServer(done) {
    const app = serverApp = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    ServerModel = app.registry.createModel({
      name: 'TestModel',
    });
    app.model(ServerModel, {dataSource: db});

    app.locals.handler.on('listening', function() { done(); });
  });

  before(function setupRemoteClient() {
    const app = clientApp = loopback({localRegistry: true});
    const remoteDs = helper.createRemoteDataSource(clientApp, serverApp);

    ClientModel = app.registry.createModel({
      name: 'TestModel',
    });
    app.model(ClientModel, {dataSource: remoteDs});
  });

  after(function() {
    serverApp.locals.handler.close();
    ServerModel = null;
    ClientModel = null;
  });

  it('should support the save method', function(done) {
    let calledServerCreate = false;

    ServerModel.create = function(data, options, cb, callback) {
      if (typeof options === 'function') {
        callback = cb;
        cb = options;
        options = {};
      }

      calledServerCreate = true;
      data.id = 1;
      if (callback) callback(null, data);
      else cb(null, data);
    };

    const m = new ClientModel({foo: 'bar'});
    m.save(function(err, instance) {
      if (err) return done(err);
      assert(instance);
      assert(instance instanceof ClientModel);
      assert(calledServerCreate);
      done();
    });
  });

  it('should support aliases', function(done) {
    let calledServerUpsert = false;
    ServerModel.patchOrCreate =
    ServerModel.upsert = function(id, options, cb) {
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }

      calledServerUpsert = true;
      cb();
    };

    ClientModel.updateOrCreate({}, function(err, instance) {
      if (err) return done(err);
      assert(instance);
      assert(instance instanceof ClientModel);
      assert(calledServerUpsert, 'server upsert should have been called');
      done();
    });
  });
});

describe('Custom Path', function() {
  let serverApp, clientApp, ServerModel, ClientModel;

  before(function setupServer(done) {
    const app = serverApp = helper.createRestAppAndListen();
    const db = helper.createMemoryDataSource(app);

    ServerModel = app.registry.createModel({
      name: 'TestModel',
      options: {
        http: {path: '/custom'},
      },
    });
    app.model(ServerModel, {dataSource: db});

    serverApp.locals.handler.on('listening', function() { done(); });
  });

  before(function setupRemoteClient() {
    const app = clientApp = loopback({localRegistry: true});
    const remoteDs = helper.createRemoteDataSource(clientApp, serverApp);

    ClientModel = app.registry.createModel({
      name: 'TestModel',
      options: {
        dataSource: 'remote',
        http: {path: '/custom'},
      },
    });
    app.model(ClientModel, {dataSource: remoteDs});
  });

  after(function() {
    serverApp.locals.handler.close();
    ServerModel = null;
    ClientModel = null;
  });

  it('should support http.path configuration', function(done) {
    ClientModel.create({}, function(err, instance) {
      if (err) return done(err);
      assert(instance);
      done();
    });
  });
});

describe('ObjectId coercion for string args', function() {
  let serverApp, clientApp, ServerModel, ClientModel;

  before(function setupServer(done) {
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

    app.locals.handler.on('listening', function() { done(); });
  });

  before(function setupRemoteClient() {
    const app = clientApp = loopback({localRegistry: true});
    const remoteDs = helper.createRemoteDataSource(clientApp, serverApp);

    ClientModel = app.registry.createModel({name: 'TestModel'});
    ClientModel.remoteMethod('endSession', {
      accepts: [
        {arg: 'machineId', type: 'string', required: true},
        {arg: 'orderId', type: 'string', required: true},
      ],
      returns: {type: 'object', root: true},
      http: {verb: 'post', path: '/end-session'},
    });
    app.model(ClientModel, {dataSource: remoteDs});
  });

  after(function() {
    serverApp.locals.handler.close();
    ServerModel = null;
    ClientModel = null;
  });

  it('should coerce ObjectId-like args to hex strings for string params', function(done) {
    const machineObjectId = {
      toHexString: function() { return '66cd41bc565b9600110e1272'; },
      toString: function() { return '66cd41bc565b9600110e1272'; },
    };
    const orderObjectId = {
      toHexString: function() { return '6a0eb6847bee16983fec880a'; },
      toString: function() { return '6a0eb6847bee16983fec880a'; },
    };

    ClientModel.endSession(machineObjectId, orderObjectId, function(err, result) {
      if (err) return done(err);
      assert.strictEqual(result.receivedMachineId, '66cd41bc565b9600110e1272');
      assert.strictEqual(result.receivedOrderId, '6a0eb6847bee16983fec880a');
      done();
    });
  });

  it('should pass through plain strings unchanged', function(done) {
    ClientModel.endSession('plain-mid', 'plain-oid', function(err, result) {
      if (err) return done(err);
      assert.strictEqual(result.receivedMachineId, 'plain-mid');
      assert.strictEqual(result.receivedOrderId, 'plain-oid');
      done();
    });
  });

  it('should NOT coerce plain objects (no toHexString) — strong-remoting drops them', function(done) {
    // A plain object as a string arg: isAcceptable rejects it, so the body
    // never contains machineId, and the server returns the "required" error.
    ClientModel.endSession({foo: 'bar'}, 'oid', function(err) {
      assert(err, 'expected validation error');
      assert(/machineId is a required argument/.test(err.message),
        'plain objects should NOT be silently coerced');
      done();
    });
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
