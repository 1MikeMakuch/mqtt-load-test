
# mqtt load test

This is a Node.js script so first do;

    $ npm install

This mqttTest.js script allows for simulating many mqtt devices both on the subscription and publish. You should run it in one session for subscriptions and another for publishing. I have tested it with mosquitto and AWS IOT.

It allows for creating multiple child processes and multiple mqtt device clients per process. It works with both the aws-iot-device-sdk as well as the mqtt client libraries.

### Example: demonstrate the throttling implemented in the aws-iot-device-sdk

By using a single mqtt/aws-iot-device-sdk client for publishing and one client with a subscription, we can see that the aws client throttles publishes at a much lower rate than the hard limit of 100 per second per client https://docs.aws.amazon.com/general/latest/gr/iot-core.html#message-broker-limits In fact this rate is limited by the drainTimeMs in

`aws-iot-device-sdk/device/index.js lines ~ 370:`

```
    //
    // Used to time draining operations; active during draining.
    //
    var drainingTimer = null
    var drainTimeMs = 250
```

Create a subscription with 1 child, 1 client:

```
    $ DEBUG_COLORS=no DEBUG="mqtt-t*" node mqttTest.js --mqttLibType=aws --numChildren=1 --numClientsPerChild=1 \
      --Host=***.amazonaws.com -Port8883 --privateKey=test001.private.key \
       --clientCert=test001.cert.pem --caCert=root-CA.crt --topic=test000 --sub=true --clientId=sdk-nodejs-sub-0

    2022-02-24T21:46:38.389Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
    2022-02-24T21:46:38.390Z mqtt-test:child 0-0 subscribed test000
```

And now publish a few messages with a single client:

```
    $ DEBUG_COLORS=no DEBUG="mqtt-test*" node mqttTest.js --mqttLibType=aws --numChildren=1 \
    --numClientsPerChild=1 --numberToPublish=20  --forkDelay=0 --Host=***.amazonaws.com \
    -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt --topic=test000 \
    --pub-single-client=true --clientId=sdk-nodejs-pub-0


    2022-02-24T21:51:46.521Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
    2022-02-24T21:51:46.522Z mqtt-test:child 0-0 published-sc 0 topic:test000 {"message":"hello from: 0-0","timestamp":1645739506522,"startTime":1645739506128}
    2022-02-24T21:51:46.522Z mqtt-test:child 0-1 published-sc 1 topic:test000 {"message":"hello from: 0-1","timestamp":1645739506522,"startTime":1645739506128}
    2022-02-24T21:51:46.522Z mqtt-test:child 0-2 published-sc 2 topic:test000 {"message":"hello from: 0-2","timestamp":1645739506522,"startTime":1645739506128}
    [snip]
    2022-02-24T21:51:46.523Z mqtt-test:child 0-17 published-sc 17 topic:test000 {"message":"hello from: 0-17","timestamp":1645739506523,"startTime":1645739506128}
    2022-02-24T21:51:46.523Z mqtt-test:child 0-18 published-sc 18 topic:test000 {"message":"hello from: 0-18","timestamp":1645739506523,"startTime":1645739506128}
    2022-02-24T21:51:46.523Z mqtt-test:child 0-19 published-sc 19 topic:test000 {"message":"hello from: 0-19","timestamp":1645739506523,"startTime":1645739506128}
```
We can see the aws-iot-device-sdk client accepts all the publishes at once, within a few milliseconds. But the subscribing client receives the messages at a much slower rate, only about 3 or 4 per second:
```
    2022-02-24T21:51:46.881Z mqtt-test:child 0-0 topic test000 received hello from: 0-0 latency:359 totalLatency:753
    2022-02-24T21:51:47.091Z mqtt-test:child 0-0 topic test000 received hello from: 0-1 latency:569 totalLatency:963
    2022-02-24T21:51:47.348Z mqtt-test:child 0-0 topic test000 received hello from: 0-2 latency:826 totalLatency:1220
    [snip]
    2022-02-24T21:51:51.141Z mqtt-test:child 0-0 topic test000 received hello from: 0-17 latency:4618 totalLatency:5013
    2022-02-24T21:51:51.402Z mqtt-test:child 0-0 topic test000 received hello from: 0-18 latency:4878 totalLatency:5273
    2022-02-24T21:51:51.650Z mqtt-test:child 0-0 topic test000 received hello from: 0-19 latency:5127 totalLatency:5522
```
And if you adjust the `drainTimeMs = 250` you will readily see the result.

This throttling is occuring in the aws-iot-device-sdk, not in the AWS IOT Core service. A couple ways to see this;

First, once all the publishes have begun, we immediately see the subscriber begin to received messages 1 at a time. If we quickly kill the publisher process with Ctrl-C, the messages immediately stop being received by the subscriber.

Second, if we create multiple clients we can see that all the messages are immediately received by the subscriber;

With the same subscriber as above and this publisher with 20 clients;

```
    $ DEBUG_COLORS=no DEBUG="mqtt-test*" node mqttTest.js --mqttLibType=aws --numChildren=1 \
    --numClientsPerChild=20 --numberToPublish=1  --forkDelay=0 --Host=***.amazonaws.com \
    -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt --topic=test000 \
    --pub-single-client=true --clientId=sdk-nodejs-pub-0

    2022-02-24T21:59:38.670Z mqtt-test:child 0-0 topic test000 received hello from: 0-0 latency:320 totalLatency:710
    2022-02-24T21:59:38.670Z mqtt-test:child 0-0 topic test000 received hello from: 0-0 latency:320 totalLatency:710
    2022-02-24T21:59:38.671Z mqtt-test:child 0-0 topic test000 received hello from: 0-0 latency:322 totalLatency:711
[snip]
    2022-02-24T21:59:38.725Z mqtt-test:child 0-0 topic test000 received hello from: 0-0 latency:337 totalLatency:765
    2022-02-24T21:59:38.726Z mqtt-test:child 0-0 topic test000 received hello from: 0-0 latency:329 totalLatency:766
    2022-02-24T21:59:38.738Z mqtt-test:child 0-0 topic test000 received hello from: 0-0 latency:319 totalLatency:778
```
So it's clear that the AWS IOT service isn't throttling, it's the aws-iot-device-sdk, i.e. the "Used to time draining operations; active during draining." you can see in the code.

The point of of this is that, if you have a server with a single aws-iot-device-sdk client sending mqtt messages on behalf of many devices, then you will run into this throttling when the number of devices becomes sufficient large. One way to address this is to increase the number of clients as I have shown above.

With this script I have successfully run tests with as many as 100 child processes each with 50 clients, on a Macbook.

### Example: demonstrate per device topics

The script allows for using deviceId specific topics, for one to one publishing or many to one or one to many. Notice in the options above the `--topic=test000`. By appending /deviceId to it as `--topic=test000/deviceId` the script replaces the "deviceId" with a counter.
```
    $ DEBUG_COLORS=no DEBUG="mqtt-t*" node mqttTest.js --mqttLibType=aws --numChildren=1 --numClientsPerChild=10 \
      --Host=***.amazonaws.com -Port8883 --privateKey=test001.private.key \
       --clientCert=test001.cert.pem --caCert=root-CA.crt --topic=test000/deviceId --sub=true --clientId=sdk-nodejs-sub-0

    2022-02-24T22:18:41.595Z mqtt-test:child 0-4 connect {"child":0,"clientId":4}
    2022-02-24T22:18:41.596Z mqtt-test:child 0-4 subscribed test000/0-4
    2022-02-24T22:18:41.602Z mqtt-test:child 0-2 connect {"child":0,"clientId":2}
    2022-02-24T22:18:41.602Z mqtt-test:child 0-2 subscribed test000/0-2
    2022-02-24T22:18:41.605Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
    2022-02-24T22:18:41.605Z mqtt-test:child 0-0 subscribed test000/0-0
    2022-02-24T22:18:41.606Z mqtt-test:child 0-8 connect {"child":0,"clientId":8}
    2022-02-24T22:18:41.606Z mqtt-test:child 0-8 subscribed test000/0-8
    [snip]
```
We can see that each client is subscribing to a different unique topic. Now to publish;
```
    $ DEBUG_COLORS=no DEBUG="mqtt-test*" node mqttTest.js --mqttLibType=aws --numChildren=1 \
    --numClientsPerChild=10 --numberToPublish=1  --forkDelay=0 --Host=***.amazonaws.com \
    -Port8883 --privateKey=test001.private.key --clientCert=test001.cert.pem --caCert=root-CA.crt \
     --topic=test000/deviceId --pub-single-client=true --clientId=sdk-nodejs-pub-0

    2022-02-24T22:20:20.234Z mqtt-test:child 0-11 connect {"child":0,"clientId":11}
    2022-02-24T22:20:20.234Z mqtt-test:child 0-11 published topic:test000/0-11 {"message":"hello from: 0-11","timestamp":1645741220234,"startTime":1645741219841}
    2022-02-24T22:20:20.235Z mqtt-test:child 0-0 connect {"child":0,"clientId":0}
    2022-02-24T22:20:20.235Z mqtt-test:child 0-0 published topic:test000/0-0 {"message":"hello from: 0-0","timestamp":1645741220235,"startTime":1645741219841}
    2022-02-24T22:20:20.235Z mqtt-test:child 0-18 connect {"child":0,"clientId":18}
    2022-02-24T22:20:20.235Z mqtt-test:child 0-18 published topic:test000/0-18 {"message":"hello from: 0-18","timestamp":1645741220235,"startTime":1645741219841}
```
We can see each client publishes to a unique topic. And on the subscriber we see each client receives it's corresponding message;
```
    2022-02-24T22:20:20.555Z mqtt-test:child 0-0 topic test000/0-0 received hello from: 0-0 latency:320 totalLatency:714
    2022-02-24T22:20:20.556Z mqtt-test:child 0-9 topic test000/0-9 received hello from: 0-9 latency:314 totalLatency:715
    2022-02-24T22:20:20.557Z mqtt-test:child 0-3 topic test000/0-3 received hello from: 0-3 latency:319 totalLatency:716
    [snip]
```