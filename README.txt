BME280 AWS Web Dashboard v4

This version adds near-real-time browser updates through:
Browser -> Amazon Cognito temporary credentials -> AWS IoT MQTT over WebSockets -> bme280/live

Historical data remains:
ESP32 -> bme280/data -> IoT Rule -> DynamoDB -> Lambda -> API Gateway

Configuration:
Region: us-east-1
Cognito Identity Pool:
us-east-1:5606f656-2567-4e46-b88f-6b19a5b0b10e
IoT endpoint:
a3sflqrsurs5gw-ats.iot.us-east-1.amazonaws.com
Live topic:
bme280/live
History API:
https://2z0d7ogwo0.execute-api.us-east-1.amazonaws.com/data

Open index.html in a browser. For file:// usage, browser security/CORS can vary; a local web server is recommended:
python -m http.server 8000
then open http://localhost:8000/

The Cognito guest IAM role must have:
iot:Connect on client/*
iot:Subscribe on topicfilter/bme280/live
iot:Receive on topic/bme280/live
and no publish permission is needed for the dashboard.

FIX v4.1:
The previous v4 used AWSIoTData.device(), which is not the global exposed by the browser SDK.
This version uses awsIot.device(), matching the AWS IoT Device SDK browser usage.
