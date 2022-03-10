
# mqtt load test

This mqttTest.js script allows for simulating many mqtt devices both on the subscription and publish. You should run it in one shell for subscriptions and another for publishing, or more! I have tested it with mosquitto and AWS IOT.

I have successfully run tests with as many as 100 child processes each with 50 clients for a total of 5000 clients, on a Macbook. With that much activity the publishing needs to be slowed down a bit, so there are options for throttling.

It allows for creating multiple child processes and multiple mqtt device clients per process. It works with both the aws-iot-device-sdk as well as the mqtt client libraries.

This is a Node.js script so first do;

```
      $ npm install
```


To run it with debug logging;

```
      $ DEBUG="mqtt-test*" node mqttTest.js

      Options:
          --baseReconnectTimeMs=int    ms
          --caCert=file                root cert file
          --clientCert=file            client cert file
          --clientId=string            if you need a uniq clientId per connection, the script appends a counter
          --concurrency=int            shortcut for setting both numChildren and numClientsPerChild to same n
          --Debug=string               true or blank
          --forkDelay=int              milliseconds to sleep between forks
          --Host=string                host
          --HostFile=file              file containing hostname
          --keepAlive=int              ms
          --mqttLibType=string         aws or mqtt which client lib to use
          --numberToPublish=int        number of publishes by each client
          --numChildren=int            number of processes to fork
          --numClientsPerChild=int     number of mqtt clients to create
          --Port=int                   port
          --privateKey=file            private key file
          --Protocol=string            mqtt, mqtts, etc
          --pub-single-client=true     special handling of single client publishing, see the code
          --pub=true                   for publisher
          --publishDelay=int           ms
          --publishDelayModulo=int     every n ms sleep for publishDelay ms
          --region=string              aws region i.e. us-west-2
          --sub=true                   for subscriber
          --topic=string               "deviceId" will be replaced with counter
```

### Example: demonstrate the queue implemented in the aws-iot-device-sdk

By using a single mqtt/aws-iot-device-sdk client for publishing and one client with a subscription, we can see that the aws client throttles publishes at a much lower rate than the hard limit of 100 per second per connection/client https://docs.aws.amazon.com/general/latest/gr/iot-core.html#message-broker-limits In fact this rate is limited by the aws client in: https://github.com/aws/aws-iot-device-sdk-js/blob/master/device/index.js#L308 see the drainTimeMs variable. If you adjust drainTimeMs lower it will speed up the publishes. We can also disable the queue by setting offlineQueuing to false.

Create a subscription with 1 child, 1 client:

```
      $ DEBUG_COLORS=no DEBUG="mqtt-t*" node mqttTest.js --mqttLibType=aws --numChildren=1 --numClientsPerChild=1 \
        --HostFile=awshost.txt -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt \
        --topic=test0 --sub=true --clientId=sub-0 2>&1 | tee sub.log

      2022-03-10T23:15:54.651Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
      2022-03-10T23:15:54.653Z mqtt-test:child 0-0 subscribed test0
```
Now create a publisher and send 20 messages all at once:
```
      $ DEBUG_COLORS=no DEBUG="mqtt-test*" node mqttTest.js --offlineQueuing=false  --mqttLibType=aws --numChildren=1 --numClientsPerChild=1 \
      --numberToPublish=20  --HostFile=awshost.txt -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt \
      --topic=test0 --pub-single-client=true --clientId=pub-0 2>&1 | tee pub.log

      2022-03-10T23:17:50.443Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
      2022-03-10T23:17:50.444Z mqtt-test:child 0-0 published-sc 1 topic:test0 {"message":"hello from: 0-0","timestamp":1646954270443,"startTime":1646954270059}
      2022-03-10T23:17:50.445Z mqtt-test:child 0-1 published-sc 2 topic:test0 {"message":"hello from: 0-1","timestamp":1646954270445,"startTime":1646954270059}
      [snip]
      2022-03-10T23:17:50.447Z mqtt-test:child 0-18 published-sc 19 topic:test0 {"message":"hello from: 0-18","timestamp":1646954270447,"startTime":1646954270059}
      2022-03-10T23:17:50.447Z mqtt-test:child 0-19 published-sc 20 topic:test0 {"message":"hello from: 0-19","timestamp":1646954270447,"startTime":1646954270059}
```
Now create enough messages to see that AWS IOT drops messages when you exceed 100 per second per connection:
```
      $ DEBUG_COLORS=no DEBUG="mqtt-test*" node mqttTest.js --offlineQueuing=false  --mqttLibType=aws --numChildren=1 --numClientsPerChild=1 \
       --numberToPublish=500  --HostFile=awshost.txt -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt \
       --topic=test0 --pub-single-client=true --clientId=pub-0 2>&1 | tee pub.log

      2022-03-10T23:24:11.569Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
      2022-03-10T23:24:11.571Z mqtt-test:child 0-0 published-sc 1 topic:test0 {"message":"hello from: 0-0","timestamp":1646954651570,"startTime":1646954651194}
      2022-03-10T23:24:11.571Z mqtt-test:child 0-1 published-sc 2 topic:test0 {"message":"hello from: 0-1","timestamp":1646954651571,"startTime":1646954651194}
      2022-03-10T23:24:11.571Z mqtt-test:child 0-2 published-sc 3 topic:test0 {"message":"hello from: 0-2","timestamp":1646954651571,"startTime":1646954651194}
      [snip]
      2022-03-10T23:25:03.287Z mqtt-test:child 0-497 published-sc 498 topic:test0 {"message":"hello from: 0-497","timestamp":1646954703287,"startTime":1646954702882}
      2022-03-10T23:25:03.287Z mqtt-test:child 0-498 published-sc 499 topic:test0 {"message":"hello from: 0-498","timestamp":1646954703287,"startTime":1646954702882}
      2022-03-10T23:25:03.287Z mqtt-test:child 0-499 published-sc 500 topic:test0 {"message":"hello from: 0-499","timestamp":1646954703287,"startTime":1646954702882}
```
You'll only receive about ~300 on the subscriber:
```
      $ DEBUG_COLORS=no DEBUG="mqtt-t*" node mqttTest.js --mqttLibType=aws --numChildren=1 --numClientsPerChild=1 \
      --HostFile=awshost.txt -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt \
       --topic=test0 --sub=true --clientId=sub-0 2>&1 | tee sub.log
      2022-03-10T23:23:59.595Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
      2022-03-10T23:23:59.596Z mqtt-test:child 0-0 subscribed test0
      2022-03-10T23:24:11.715Z mqtt-test:child 0-0 topic test0 received 1 hello from: 0-2 latency:144 totalTime:521
      2022-03-10T23:24:11.716Z mqtt-test:child 0-0 topic test0 received 2 hello from: 0-8 latency:144 totalTime:522
      2022-03-10T23:24:11.717Z mqtt-test:child 0-0 topic test0 received 3 hello from: 0-0 latency:147 totalTime:523
      [snip]
      2022-03-10T23:24:11.837Z mqtt-test:child 0-0 topic test0 received 308 hello from: 0-360 latency:248 totalTime:643
      2022-03-10T23:24:11.837Z mqtt-test:child 0-0 topic test0 received 309 hello from: 0-214 latency:254 totalTime:643
      2022-03-10T23:24:11.853Z mqtt-test:child 0-0 topic test0 received 310 hello from: 0-75 latency:276 totalTime:659
      2022-03-10T23:24:11.859Z mqtt-test:child 0-0 topic test0 received 311 hello from: 0-39 latency:284 totalTime:665
```
the rest are ignored because we've exceeded AWS limit of 100/sec per connection.

By slowing down our publishing we can send 1k messages in under 1 minute and the subscriber receives them all:
```
      $ DEBUG_COLORS=no DEBUG="mqtt-test*" node mqttTest.js --offlineQueuing=false  --mqttLibType=aws --numChildren=1 --numClientsPerChild=1 \
      --numberToPublish=1000  --publishDelayModulo=100 --publishDelay=1000  --HostFile=awshost.txt -Port8883 --privateKey=test001.private.key \
      --clientCert=test001.cert.pem --caCert=root-CA.crt --topic=test0 --pub-single-client=true --clientId=pub-0 2>&1 | tee pub.log

      2022-03-10T23:29:57.294Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
      2022-03-10T23:29:57.295Z mqtt-test:child 0-0 published-sc 1 topic:test0 {"message":"hello from: 0-0","timestamp":1646954997294,"startTime":1646954996927}
      2022-03-10T23:29:57.295Z mqtt-test:child 0-1 published-sc 2 topic:test0 {"message":"hello from: 0-1","timestamp":1646954997295,"startTime":1646954996927}
      2022-03-10T23:29:57.296Z mqtt-test:child 0-2 published-sc 3 topic:test0 {"message":"hello from: 0-2","timestamp":1646954997296,"startTime":1646954996927}
      [snip]
      2022-03-10T23:30:06.375Z mqtt-test:child 0-997 published-sc 998 topic:test0 {"message":"hello from: 0-997","timestamp":1646955006375,"startTime":1646954996927}
      2022-03-10T23:30:06.375Z mqtt-test:child 0-998 published-sc 999 topic:test0 {"message":"hello from: 0-998","timestamp":1646955006375,"startTime":1646954996927}
      2022-03-10T23:30:06.375Z mqtt-test:child 0-999 published-sc 1000 topic:test0 {"message":"hello from: 0-999","timestamp":1646955006375,"startTime":1646954996927}
```
and the subscriber receives them as soon as they are published:
```
      $ DEBUG_COLORS=no DEBUG="mqtt-t*" node mqttTest.js --mqttLibType=aws --numChildren=1 --numClientsPerChild=1 --HostFile=awshost.txt \
       -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt --topic=test0 \
       --sub=true --clientId=sub-0 2>&1 | tee sub.log

      2022-03-10T23:29:05.996Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
      2022-03-10T23:29:05.998Z mqtt-test:child 0-0 subscribed test0
      2022-03-10T23:29:57.423Z mqtt-test:child 0-0 topic test0 received 1 hello from: 0-0 latency:129 totalTime:496
      2022-03-10T23:29:57.425Z mqtt-test:child 0-0 topic test0 received 2 hello from: 0-2 latency:129 totalTime:498
      2022-03-10T23:29:57.428Z mqtt-test:child 0-0 topic test0 received 3 hello from: 0-3 latency:132 totalTime:501
      2022-03-10T23:29:57.428Z mqtt-test:child 0-0 topic test0 received 4 hello from: 0-7 latency:131 totalTime:501
      [snip]
      2022-03-10T23:30:06.470Z mqtt-test:child 0-0 topic test0 received 998 hello from: 0-953 latency:97 totalTime:9543
      2022-03-10T23:30:06.470Z mqtt-test:child 0-0 topic test0 received 999 hello from: 0-995 latency:95 totalTime:9543
      2022-03-10T23:30:06.470Z mqtt-test:child 0-0 topic test0 received 1000 hello from: 0-996 latency:95 totalTime:9543
```
