var mongoskin = require('mongoskin')
, https = require('https')
, debug = require('debug')('joggy:web')
, services = require('../lib/server/services')
, Site = require('../lib/server/controllers/Site')

process.env.DEBUG || (process.env.DEBUG = '.*');

process.on('uncaughtException', function(err) {
    console.error('uncaught exception in process')
    console.error(err)
    console.error(err.stack)
})

services.config = require('../config')
services.db = mongoskin.db(services.config.db, { safe: true })
services.sync = require('../lib/server/app.db.sync')

if (services.config.BTC) {
    services.bitcoin = new (require('../lib/server/controllers/Bitcoin'))()
}

services.site = new Site()

var webapp = require('../lib/server/webapp')()
, listener

if (services.config.ssl) {
    var ssl = require('../lib/server/ssl')
    listener = require('https').createServer({
        key: ssl.key,
        cert: ssl.cert
    }, webapp)
} else {
    listener = require('http').createServer(webapp)
}

var socketapp = require('../lib/server/socketapp')(listener)

socketapp.on('connection', services.site.connectClient.bind(services.site))

var port = process.env.PORT || services.config.port
debug('listening in port ' + port)

listener.listen(port)
