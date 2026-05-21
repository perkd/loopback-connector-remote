// Copyright IBM Corp. 2018,2019. All Rights Reserved.
// Node module: loopback-connector-remote
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const helper = require('./helper');
const loopback = require('loopback');
const sinon = require('sinon');

const relation = require('loopback-datasource-juggler/lib/relation-definition');
const RelationTypes = relation.RelationTypes;

describe('Models Define Type Tests', function() {
  let serverApp, clientApp, remoteDs, defineObjectTypeSpy, ChildModel;

  beforeEach(() => {
    serverApp = helper.createRestAppAndListen();
    clientApp = loopback({localRegistry: true});
    remoteDs = helper.createRemoteDataSource(clientApp, serverApp);
    defineObjectTypeSpy = sinon.spy(remoteDs.connector.remotes,
      'defineObjectType');
  });

  afterEach(() => {
    defineObjectTypeSpy.restore();
    serverApp.locals.handler.close();
  });

  it('should define a type of a remote model only once (no relations)', () => {
    const RemoteModel = clientApp.registry.createModel({
      name: 'RemoteModel',
    });
    clientApp.model(RemoteModel, {dataSource: remoteDs});

    sinon.assert.calledOnce(defineObjectTypeSpy.withArgs(
      RemoteModel.modelName,
    ));
  });

  describe('when a child model is created', () => {
    beforeEach(() => {
      ChildModel = clientApp.registry.createModel({
        name: 'ChildModel',
      });
      clientApp.model(ChildModel, {dataSource: remoteDs});
    });

    Object.getOwnPropertyNames(RelationTypes).forEach((relationKey) => {
      const relation = RelationTypes[relationKey];

      it('should define a type of a remote model only once (' + relation + ')',
        () => {
          const RemoteModel = clientApp.registry.createModel({
            name: 'RemoteModel' + relation,
            relations: {
              children: {
                type: relation,
                model: 'ChildModel',
              },
            },
          });
          clientApp.model(RemoteModel, {dataSource: remoteDs});

          sinon.assert.calledOnce(defineObjectTypeSpy.withArgs(
            RemoteModel.modelName,
          ));
          sinon.assert.calledOnce(defineObjectTypeSpy.withArgs(
            ChildModel.modelName,
          ));
        });
    });
  });
});
