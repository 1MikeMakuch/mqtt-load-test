//
//

const getopts = require('getopts')
let debug = require('debug')('mqtt-test:parent')
let debugE = require('debug')('mqtt-test:error:parent')
const moment = require('moment')
const _ = require('lodash')
const {fork} = require('child_process')

let opts = {options: {}}
opts = getopts(process.argv.slice(2))

if (opts.concurrency) {
  opts.numClientsPerChild = opts.concurrency
  opts.numChildren = opts.concurrency
} else {
  opts.numClientsPerChild = opts.numClientsPerChild || 1
  opts.numChildren = opts.numChildren || 1
}
opts.forkDelay = opts.forkDelay || 1000
opts.numberToPublish = opts.numberToPublish || 1

const children = new Array(opts.numChildren).fill(null)

let startTime = Date.now()
main()
async function main() {
  if (!_.has(opts, 'child')) {
    //
    // parent

    debug('This is the parent', process.pid, JSON.stringify(process.argv))
    const controller = new AbortController()
    const {signal} = controller

    // fork off processes
    for (let i = 0; i < opts.numChildren; i++) {
      let args = JSON.parse(JSON.stringify(process.argv.slice(2)))
      args.push('--child=' + i)
      debug('args', i, JSON.stringify(args))
      children[i] = fork(__filename, args, {signal})
      await sleep(opts.forkDelay) // throttle
    }
  } else {
    //
    // child

    debug = require('debug')('mqtt-test:child')
    debugE = require('debug')('mqtt-test:error:child')
    debug('This is a child', process.pid, JSON.stringify(process.argv))
    debug('opts', JSON.stringify(opts))

    opts.numberPublishes = opts.numberPublishes || 1

    const clients = new Array(opts.numClientsPerChild).fill(null)
    debug('clients 0', JSON.stringify(clients))
    let numberPublishes = 0

    if ('aws' === opts.mqttLibType) {
      debug('aws')
      let deviceModule = require('aws-iot-device-sdk').device

      for (let i = 0; i < opts.numClientsPerChild; i++) {
        const clientId = opts.clientId + '-' + opts.child + '-' + i
        clients[i] = deviceModule({
          keyPath: opts.privateKey,
          certPath: opts.clientCert,
          caPath: opts.caCert,
          clientId: clientId,
          region: opts.region,
          baseReconnectTimeMs: opts.baseReconnectTimeMs,
          keepalive: opts.keepAlive,
          protocol: opts.Protocol,
          port: opts.Port,
          host: opts.Host,
          debug: opts.Debug
        })
        clients[i].clientId = i
        mqttOps(clients[i])
      }
    } else if ('mosquitto' === opts.mqttLibType) {
      const mqtt = require('mqtt')
      // const tls = {}
      // tls.mqtt = require('./node_modules/mqtt/lib/connect/tls')

      let config = {
        url: 'mqtts://' + opts.Host,
        connect: {
          connectTimeout: 5000,
          reconnectPeriod: opts.baseReconnectTimeMs,
          rejectUnauthorized: true,
          clientId: opts.clientId,
          host: opts.Host,
          servername: opts.Host,
          port: opts.Port,
          resubscribe: false,
          username: '?SDK=JavaScript&Version=2.2.11',
          requestCert: true,
          protocol: opts.Protocol || 'mqtt'
        }
      }
      if (opts.privateKey) config.connect.keyPath = opts.privateKey
      if (opts.clientCert) config.connect.certPath = opts.clientCert
      if (opts.caCert) config.connect.caPath = opts.caCert

      for (let i = 0; i < opts.numClientsPerChild; i++) {
        clients[i] = new mqtt.connect(config.url, config.connect)
        //clients[i] = new mqtt.MqttClient(_wrapper, config.connect)
        clients[i].clientId = i
        mqttOps(clients[i])
      }
    } else {
      debugE('mqttType required')
      process.exit()
    }

    async function mqttOps(client) {
      client.on('connect', async function (data) {
        const deviceId = opts.child + '-' + client.clientId
        debug(deviceId, 'connect', JSON.stringify({child: opts.child, clientId: client.clientId}))

        let topic
        if (opts.topic) {
          topic = opts.topic
        }
        if (topic.match(/\/deviceId/)) {
          topic = topic.replace('deviceId', deviceId)
        }

        if (opts['sub']) {
          client.subscribe(topic)
          debug(deviceId, 'subscribed', topic)
        }

        if (opts['pub']) {
          for (let i = 0; i < opts.numberToPublish; i++) {
            let payload = {message: 'hello from: ' + deviceId, timestamp: Date.now(), startTime}
            client.publish(topic, JSON.stringify(payload))
            debug(deviceId, 'published', 'topic:' + topic, JSON.stringify(payload))
            numberPublishes++
            if (0 === i % opts.publishDelayModulo) await sleep(opts.publishDelay)
          }
        }
        if (opts['pub-single-client']) {
          let i = 0
          let clientId = 0
          while (i < opts.numberToPublish) {
            let deviceId = '0-' + clientId
            let payload = {message: 'hello from: ' + deviceId, timestamp: Date.now(), startTime}
            if (topic.match(/\/deviceId/)) {
              topic = topic.replace('deviceId', deviceId)
            }
            client.publish(topic, JSON.stringify(payload))
            debug(deviceId, 'published-sc', numberPublishes, 'topic:' + topic, JSON.stringify(payload))
            numberPublishes++
            if (0 === i % opts.publishDelayModulo) await sleep(opts.publishDelay)
            i++
            clientId++
          }
        }

        client.on('close', function (data) {
          debug(deviceId, 'close')
        })

        client.on('reconnect', function (data) {
          debug(deviceId, 'reconnect')
        })

        client.on('offline', function (data) {
          debug(deviceId, 'offline')
        })

        client.on('error', function (error) {
          debug(deviceId, 'error', error)
        })

        client.on('message', function (topic, _payload) {
          const payload = JSON.parse(_payload.toString())
          const now = Date.now()
          const latency = now - payload.timestamp
          const totalLatency = now - payload.startTime
          debug(
            deviceId,
            'topic',
            topic,
            'received',
            payload.message,
            'latency:' + latency,
            'totalLatency:' + totalLatency
          )
        })
      })
    }
    if (opts.pub) {
      ;(async () => {
        while (numberPublishes < clients.length) {
          //debug('waiting for publishes to complete')
          await new Promise(res => setTimeout(res, 1000))
        }
        await new Promise(res => setTimeout(res, 1000))
        //debug('exiting')
        //process.exit()
      })()
    }
  }
}

async function sleep(msec) {
  debug('sleeping', msec)
  await new Promise(res => setTimeout(res, msec))
}
