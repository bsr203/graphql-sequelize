'use strict';

var chai = require('chai')
  , expect = chai.expect
  , resolver = require('../src/resolver')
  , helper = require('./helper')
  , sequelize = helper.sequelize
  , Sequelize = require('sequelize')
  , Promise = helper.Promise
  , attributeFields = require('../src/attributeFields');

import {
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  graphql
} from 'graphql';

import {
  sequelizeNodeInterface
} from '../src/relay';

import {
  globalIdField,
  toGlobalId,
  connectionDefinitions,
  connectionArgs,
  connectionFromArray
} from 'graphql-relay';

function generateTask(id) {
  return {
    id: id,
    name: Math.random().toString()
  }
}

describe('relay', function () {
  var Viewer
    , User
    , Task
    , userType
    , taskType
    , taskConnection
    , nodeInterface
    , Project
    , projectType
    , viewerType
    , userConnection
    , nodeField
    , schema;

  before(function () {
    sequelize.modelManager.models = [];
    sequelize.models = {};
    Viewer = sequelize.define('Viewer', {
      name: {
        type: Sequelize.STRING
      }
    }, {
      timestamps: false
    });

    User = sequelize.define('User', {
      name: {
        type: Sequelize.STRING
      }
    }, {
      timestamps: false
    });

    Task = sequelize.define('Task', {
      name: {
        type: Sequelize.STRING
      }
    }, {
      timestamps: false
    });

    Project = sequelize.define('Project', {
      name: {
        type: Sequelize.STRING
      }
    }, {
      timestamps: false
    });

    Viewer.Users = Viewer.hasMany(User, {as: 'users'});
    User.Tasks = User.hasMany(Task, {as: 'tasks'});
    Project.Users = Project.hasMany(User, {as: 'users'});

    var node = sequelizeNodeInterface(sequelize);
    nodeInterface = node.nodeInterface;
    nodeField = node.nodeField;
    var nodeTypeMapper = node.nodeTypeMapper;

    taskType = new GraphQLObjectType({
      name: 'Task',
      fields: {
        id: globalIdField('Task'),
        name: {
          type: GraphQLString
        }
      },
      interfaces: [nodeInterface]
    });

    var taskConnection = connectionDefinitions({name: 'Task', nodeType: taskType});


    userType = new GraphQLObjectType({
      name: 'User',
      fields: {
        id: globalIdField('User'),
        name: {
          type: GraphQLString
        },
        tasks: {
          type: taskConnection.connectionType,
          args: connectionArgs,
          resolve: resolver(User.Tasks)
        }
      },
      interfaces: [nodeInterface]
    });

    var userConnection = connectionDefinitions({name: 'User', nodeType: userType});

    projectType = new GraphQLObjectType({
      name: 'Project',
      fields: {
        id: globalIdField('User'),
        name: {
          type: GraphQLString
        },
        users: {
          type: userConnection.connectionType,
          args: connectionArgs,
          resolve: resolver(Project.Users)
        }
      }
    });

    viewerType = new GraphQLObjectType({
      name: 'Viewer',
      description: 'root viewer for queries',

      fields: () => ({
        id: globalIdField('Viewer'),
        name: {
          type: GraphQLString,
          resolve: () => 'Viewer!'
        },
        users: {
          type: userConnection.connectionType,
          args: connectionArgs,
          resolve: resolver(Viewer.Users)
        }
      }),
      interfaces: [nodeInterface]
  });


    nodeTypeMapper.mapTypes({
      [User.name]: userType,
      [Project.name]: projectType,
      [Task.name]: taskType,
      [Viewer.name]: viewerType
    });


    schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'RootQueryType',
        fields: {
          viewer: {
            type: viewerType,
            //resolve: (root) => (root)
            resolve: () => Viewer.build()

          },
          user: {
            type: userType,
            args: {
              id: {
                type: new GraphQLNonNull(GraphQLInt)
              }
            },
            resolve: resolver(User)
          },
          // users: {
          //   type: userConnection.connectionType,
          //   args: connectionArgs,
          //   resolve: resolver(User)
          // },
          project: {
            type: projectType,
            args: {
              id: {
                type: new GraphQLNonNull(GraphQLInt)
              }
            },
            resolve: resolver(Project)
          },
          node: nodeField
        }
      })
    });

  });

  before(function () {
    var userId = 1
      , projectId = 1
      , taskId = 1;

    return this.sequelize.sync({force: true}).bind(this).then(function () {
      return Promise.join(
        Project.create({
          id: projectId++,
          name: 'project-' + Math.random().toString()
        }),
        User.create({
          id: userId++,
          name: 'a' + Math.random().toString(),
          tasks: [generateTask(taskId++), generateTask(taskId++), generateTask(taskId++)]
        }, {
          include: [User.Tasks]
        }),
        User.create({
          id: userId++,
          name: 'b' + Math.random().toString(),
          tasks: [generateTask(taskId++), generateTask(taskId++)]
        }, {
          include: [User.Tasks]
        })
      ).bind(this).spread(function (project, userA, userB) {
          this.project = project;
          this.userA = userA;
          this.userB = userB;
          this.users = [userA, userB];
        });
    });
  });

  before(function () {
    return this.project.setUsers([this.userA.id, this.userB.id]);
  });

  it.only('should resolve an array of objects containing connections', function () {
    var users = this.users;

    return graphql(schema, `
      {
        viewer {
          users {
            edges {
              node {
                name
              }
            }
          }
        }
      }
    `).then(function (result) {
      if (result.errors) throw new Error(result.errors[0].stack);

      expect(result.data.viewer.users.edges.length).to.equal(users.length);
      result.data.viewer.users.edges.forEach(function (edge, k) {
        expect(edge.node.name).to.equal(users[k].name);
        //expect(edge.node.tasks.edges).to.have.length.above(0);
      });

    });
  });


});
