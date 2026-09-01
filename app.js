// ============================================================
// BME280 AWS DASHBOARD
// ============================================================
// LIVE:
//   ESP32 -> AWS IoT Core -> MQTT/WSS -> Browser
//
// HISTORY:
//   ESP32 -> AWS IoT Core -> IoT Rule
//        -> DynamoDB -> Lambda -> API Gateway -> Browser
// ============================================================


// ------------------------------------------------------------
// AWS CONFIGURATION
// ------------------------------------------------------------

const AWS_REGION = "us-east-1";

const IDENTITY_POOL_ID =
  "us-east-1:5606f656-2567-4e46-b88f-6b19a5b0b10e";

const IOT_ENDPOINT =
  "a3sflqrsurs5gw-ats.iot.us-east-1.amazonaws.com";

const LIVE_TOPIC =
  "bme280/live";

const API_URL =
  "https://2z0d7ogwo0.execute-api.us-east-1.amazonaws.com/data";


// ------------------------------------------------------------
// GLOBAL VARIABLES
// ------------------------------------------------------------

let selectedHours = 0.25;

let latestHistory = [];

let tempChart = null;
let humChart = null;

let lastLiveTimestamp = null;

let iotDevice = null;


// ------------------------------------------------------------
// DOM SHORTCUT
// ------------------------------------------------------------

const $ = id => document.getElementById(id);


// ------------------------------------------------------------
// NUMBER FORMAT
// ------------------------------------------------------------

function fmt(n, d = 2) {
  const value = Number(n);

  if (!Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(d);
}


// ------------------------------------------------------------
// LIVE STATUS
// ------------------------------------------------------------

function setLiveStatus(state, text) {

  const el = $("liveStatus");

  if (!el) {
    return;
  }

  el.className = `status ${state}`;

  el.innerHTML = `<span></span> ${text}`;
}


// ------------------------------------------------------------
// TIME FORMAT
// ------------------------------------------------------------

function formatTime(ms) {

  return new Date(Number(ms)).toLocaleString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}


// ------------------------------------------------------------
// AGE TEXT
// ------------------------------------------------------------

function ageText(ms) {

  const seconds =
    Math.max(
      0,
      Math.floor(
        (Date.now() - Number(ms)) / 1000
      )
    );

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  const remainingMinutes =
    minutes % 60;

  return `${hours} h ${remainingMinutes} min ago`;
}


// ------------------------------------------------------------
// STATISTICS
// ------------------------------------------------------------

function statistics(values) {

  if (!values.length) {
    return {
      min: 0,
      max: 0,
      avg: 0
    };
  }

  const min =
    Math.min(...values);

  const max =
    Math.max(...values);

  const avg =
    values.reduce(
      (a, b) => a + b,
      0
    ) / values.length;

  return {
    min,
    max,
    avg
  };
}


// ============================================================
// LIVE MQTT
// ============================================================

function startLiveMqtt() {

  console.log("========================================");
  console.log("STARTING AWS IoT LIVE MQTT");
  console.log("========================================");

  console.log("AWS Region:", AWS_REGION);
  console.log("Identity Pool:", IDENTITY_POOL_ID);
  console.log("IoT Endpoint:", IOT_ENDPOINT);
  console.log("Live Topic:", LIVE_TOPIC);


  // ----------------------------------------------------------
  // Check AWS SDK
  // ----------------------------------------------------------

  if (typeof AWS === "undefined") {

    console.error(
      "AWS SDK is not loaded."
    );

    setLiveStatus(
      "offline",
      "AWS SDK ERROR"
    );

    $("liveMessage").textContent =
      "AWS SDK was not loaded";

    return;
  }


  // ----------------------------------------------------------
  // Check AWS IoT Device SDK
  // ----------------------------------------------------------

  if (
    typeof awsIot === "undefined" ||
    typeof awsIot.device !== "function"
  ) {

    console.error(
      "AWS IoT Device SDK is not loaded."
    );

    console.error(
      "Expected window.awsIot.device"
    );

    setLiveStatus(
      "offline",
      "SDK ERROR"
    );

    $("liveMessage").textContent =
      "AWS IoT browser SDK is not available";

    return;
  }


  console.log(
    "AWS IoT Device SDK detected."
  );


  // ----------------------------------------------------------
  // Configure AWS
  // ----------------------------------------------------------

  AWS.config.region =
    AWS_REGION;


  AWS.config.credentials =
    new AWS.CognitoIdentityCredentials({
      IdentityPoolId:
        IDENTITY_POOL_ID
    });


  setLiveStatus(
    "connecting",
    "COGNITO"
  );

  $("liveMessage").textContent =
    "Getting temporary AWS credentials...";


  // ----------------------------------------------------------
  // Get Cognito credentials
  // ----------------------------------------------------------

  AWS.config.credentials.get(
    function (err) {

      if (err) {

        console.error(
          "========================================"
        );

        console.error(
          "COGNITO CREDENTIAL ERROR"
        );

        console.error(err);

        console.error(
          "========================================"
        );

        setLiveStatus(
          "offline",
          "COGNITO ERROR"
        );

        $("liveMessage").textContent =
          err.message ||
          "Unable to get temporary credentials";

        return;
      }


      const creds =
        AWS.config.credentials;


      console.log(
        "Cognito credentials obtained."
      );

      console.log(
        "Access Key ID:",
        creds.accessKeyId
      );

      console.log(
        "Session Token:",
        creds.sessionToken
          ? "AVAILABLE"
          : "MISSING"
      );


      // --------------------------------------------------------
      // Create MQTT/WebSocket device
      // --------------------------------------------------------

      try {

        console.log(
          "Creating AWS IoT WebSocket client..."
        );


        iotDevice =
          new awsIot.device({

            region:
              AWS_REGION,

            host:
              IOT_ENDPOINT,

            clientId:
              `BME280Dashboard-${Date.now()}-${Math.random()
                .toString(16)
                .slice(2)}`,

            protocol:
              "wss",

            accessKeyId:
              creds.accessKeyId,

            secretKey:
              creds.secretAccessKey,

            sessionToken:
              creds.sessionToken,

            maximumReconnectTimeMs:
              8000,

            keepalive:
              30,

            debug:
              true
          });


        console.log(
          "AWS IoT device object created."
        );


      } catch (error) {

        console.error(
          "FAILED TO CREATE AWS IoT DEVICE"
        );

        console.error(error);

        setLiveStatus(
          "offline",
          "MQTT ERROR"
        );

        $("liveMessage").textContent =
          error.message ||
          "Unable to create MQTT client";

        return;
      }


      // ========================================================
      // MQTT CONNECT
      // ========================================================

      iotDevice.on(
        "connect",
        function () {

          console.log(
            "========================================"
          );

          console.log(
            "AWS IoT WebSocket CONNECTED"
          );

          console.log(
            "========================================"
          );


          setLiveStatus(
            "online",
            "LIVE ONLINE"
          );

          $("liveMessage").textContent =
            "Connected — subscribing to bme280/live";


          // ----------------------------------------------------
          // Subscribe
          // ----------------------------------------------------

          console.log(
            "Subscribing to:",
            LIVE_TOPIC
          );


          iotDevice.subscribe(
            LIVE_TOPIC,
            {
              qos: 0
            },
            function (err) {

              if (err) {

                console.error(
                  "========================================"
                );

                console.error(
                  "MQTT SUBSCRIBE ERROR"
                );

                console.error(err);

                console.error(
                  "========================================"
                );


                setLiveStatus(
                  "offline",
                  "SUBSCRIBE ERROR"
                );

                $("liveMessage").textContent =
                  err.message ||
                  "Subscribe failed";

                return;
              }


              console.log(
                "========================================"
              );

              console.log(
                "MQTT SUBSCRIBED SUCCESSFULLY"
              );

              console.log(
                "Topic:",
                LIVE_TOPIC
              );

              console.log(
                "========================================"
              );


              setLiveStatus(
                "online",
                "LIVE ONLINE"
              );

              $("liveMessage").textContent =
                "Waiting for bme280/live...";
            }
          );
        }
      );


      // ========================================================
      // MQTT MESSAGE
      // ========================================================

      iotDevice.on(
        "message",
        function (topic, payload) {

          console.log(
            "========================================"
          );

          console.log(
            "MQTT MESSAGE RECEIVED"
          );

          console.log(
            "Topic:",
            topic
          );

          console.log(
            "Payload:",
            payload.toString()
          );

          console.log(
            "========================================"
          );


          // Ignore other topics

          if (topic !== LIVE_TOPIC) {
            return;
          }


          try {

            const text =
              payload.toString();

            const data =
              JSON.parse(text);


            console.log(
              "Parsed live data:",
              data
            );


            const temperature =
              Number(data.temperature);

            const humidity =
              Number(data.humidity);


            if (
              !Number.isFinite(temperature) ||
              !Number.isFinite(humidity)
            ) {

              throw new Error(
                "Invalid temperature or humidity"
              );
            }


            // --------------------------------------------------
            // Update timestamp
            // --------------------------------------------------

            const now =
              Date.now();

            lastLiveTimestamp =
              now;


            // --------------------------------------------------
            // Update dashboard
            // --------------------------------------------------

            $("currentTemp").textContent =
              fmt(temperature);

            $("currentHum").textContent =
              fmt(humidity);

            $("device").textContent =
              data.device ||
              "ESP32-BME280";

            $("lastUpdate").textContent =
              formatTime(now);

            $("updateAge").textContent =
              "LIVE • updated just now";

            $("liveMessage").textContent =
              `Live reading: ${fmt(temperature)} °C • ${fmt(humidity)} %`;


            setLiveStatus(
              "online",
              "LIVE ONLINE"
            );


          } catch (error) {

            console.error(
              "INVALID LIVE JSON"
            );

            console.error(error);

          }
        }
      );


      // ========================================================
      // MQTT ERROR
      // ========================================================

      iotDevice.on(
        "error",
        function (error) {

          console.error(
            "========================================"
          );

          console.error(
            "AWS IoT MQTT ERROR"
          );

          console.error(error);

          console.error(
            "========================================"
          );


          setLiveStatus(
            "offline",
            "LIVE ERROR"
          );


          $("liveMessage").textContent =
            error && error.message
              ? error.message
              : "MQTT connection error";
        }
      );


      // ========================================================
      // MQTT CLOSE
      // ========================================================

      iotDevice.on(
        "close",
        function () {

          console.warn(
            "AWS IoT WebSocket CLOSED"
          );


          setLiveStatus(
            "connecting",
            "RECONNECTING"
          );


          $("liveMessage").textContent =
            "Live connection closed — reconnecting...";
        }
      );


      // ========================================================
      // MQTT OFFLINE
      // ========================================================

      iotDevice.on(
        "offline",
        function () {

          console.warn(
            "AWS IoT client OFFLINE"
          );


          setLiveStatus(
            "connecting",
            "RECONNECTING"
          );
        }
      );


      // ========================================================
      // MQTT RECONNECT
      // ========================================================

      iotDevice.on(
        "reconnect",
        function () {

          console.log(
            "AWS IoT RECONNECTING..."
          );


          setLiveStatus(
            "connecting",
            "RECONNECTING"
          );
        }
      );


      // ========================================================
      // MQTT END
      // ========================================================

      iotDevice.on(
        "end",
        function () {

          console.warn(
            "AWS IoT connection END"
          );
        }
      );

    }
  );
}


// ============================================================
// HISTORY CHART
// ============================================================

function makeChart(
  canvasId,
  label,
  values,
  unit,
  existing
) {

  if (existing) {
    existing.destroy();
  }


  const labels =
    latestHistory.map(
      x =>
        new Date(
          Number(x.timestamp)
        ).toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )
    );


  return new Chart(
    $(canvasId),
    {
      type: "line",

      data: {
        labels,

        datasets: [
          {
            label,

            data: values,

            borderColor:
              "#36a7ff",

            backgroundColor:
              "rgba(54,167,255,.10)",

            borderWidth: 2,

            pointRadius: 2,

            pointHoverRadius: 5,

            tension: 0.25,

            fill: true
          }
        ]
      },

      options: {

        responsive: true,

        maintainAspectRatio: false,

        interaction: {
          mode: "index",
          intersect: false
        },

        plugins: {

          legend: {
            labels: {
              color: "#e8f0fb"
            }
          },

          tooltip: {
            callbacks: {

              label: c =>
                `${c.parsed.y.toFixed(2)} ${unit}`
            }
          }
        },

        scales: {

          x: {

            ticks: {
              color: "#8fa4bd",
              maxTicksLimit: 12
            },

            grid: {
              color:
                "rgba(100,130,165,.18)"
            }
          },

          y: {

            ticks: {
              color: "#8fa4bd"
            },

            grid: {
              color:
                "rgba(100,130,165,.22)"
            }
          }
        }
      }
    }
  );
}


// ============================================================
// UPDATE HISTORY
// ============================================================

function updateHistory(data) {

  latestHistory =
    [...data].sort(
      (a, b) =>
        Number(a.timestamp) -
        Number(b.timestamp)
    );


  if (!latestHistory.length) {

    $("rangeText").textContent =
      "No readings in selected period";

    return;
  }


  const temps =
    latestHistory.map(
      x => Number(x.temperature)
    );

  const hums =
    latestHistory.map(
      x => Number(x.humidity)
    );


  const ts =
    statistics(temps);

  const hs =
    statistics(hums);


  // ----------------------------------------------------------
  // Temperature statistics
  // ----------------------------------------------------------

  $("tempMin").textContent =
    fmt(ts.min);

  $("tempAvg").textContent =
    fmt(ts.avg);

  $("tempMax").textContent =
    fmt(ts.max);


  // ----------------------------------------------------------
  // Humidity statistics
  // ----------------------------------------------------------

  $("humMin").textContent =
    fmt(hs.min);

  $("humAvg").textContent =
    fmt(hs.avg);

  $("humMax").textContent =
    fmt(hs.max);


  // ----------------------------------------------------------
  // Reading count
  // ----------------------------------------------------------

  $("tempCount").textContent =
    `${temps.length} readings`;

  $("humCount").textContent =
    `${hums.length} readings`;


  // ----------------------------------------------------------
  // Time range
  // ----------------------------------------------------------

  const start =
    Number(
      latestHistory[0].timestamp
    );

  const end =
    Number(
      latestHistory[
        latestHistory.length - 1
      ].timestamp
    );


  const mins =
    Math.max(
      1,
      Math.round(
        (end - start) / 60000
      )
    );


  $("rangeText").textContent =
    `${latestHistory.length} readings • Last ${
      mins < 60
        ? mins + " min"
        : (mins / 60).toFixed(1) + " hours"
    }`;


  // ----------------------------------------------------------
  // Charts
  // ----------------------------------------------------------

  tempChart =
    makeChart(
      "tempChart",
      "Temperature (°C)",
      temps,
      "°C",
      tempChart
    );


  humChart =
    makeChart(
      "humChart",
      "Humidity (%)",
      hums,
      "%",
      humChart
    );
}


// ============================================================
// LOAD HISTORY
// ============================================================

async function loadHistory() {

  try {

    console.log(
      "Loading history..."
    );


    const res =
      await fetch(
        `${API_URL}?hours=${selectedHours}`,
        {
          cache: "no-store"
        }
      );


    if (!res.ok) {

      throw new Error(
        `HTTP ${res.status}`
      );
    }


    const json =
      await res.json();


    if (!json.success) {

      throw new Error(
        json.error ||
        "API error"
      );
    }


    updateHistory(
      json.data || []
    );


    console.log(
      "History loaded:",
      json.data?.length || 0,
      "readings"
    );


  } catch (err) {

    console.error(
      "History API error:",
      err
    );


    $("rangeText").textContent =
      `History API error: ${err.message}`;
  }
}


// ============================================================
// CSV DOWNLOAD
// ============================================================

$("downloadCsv").addEventListener(
  "click",
  () => {

    if (!latestHistory.length) {
      return;
    }


    const rows = [
      [
        "device",
        "timestamp",
        "date_time",
        "temperature_C",
        "humidity_percent"
      ]
    ];


    latestHistory.forEach(
      x => {

        rows.push([
          x.device,
          x.timestamp,
          formatTime(x.timestamp),
          x.temperature,
          x.humidity
        ]);

      }
    );


    const csv =
      rows
        .map(
          r =>
            r
              .map(
                v =>
                  `"${String(v).replaceAll(
                    '"',
                    '""'
                  )}"`
              )
              .join(",")
        )
        .join("\n");


    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );


    const a =
      document.createElement("a");


    a.href =
      URL.createObjectURL(blob);


    a.download =
      `BME280_${selectedHours}h.csv`;


    a.click();


    URL.revokeObjectURL(
      a.href
    );
  }
);


// ============================================================
// REFRESH HISTORY BUTTON
// ============================================================

$("refreshNow").addEventListener(
  "click",
  loadHistory
);


// ============================================================
// RANGE BUTTONS
// ============================================================

document
  .querySelectorAll(".range")
  .forEach(
    btn => {

      btn.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(".range")
            .forEach(
              b =>
                b.classList.remove(
                  "active"
                )
            );


          btn.classList.add(
            "active"
          );


          selectedHours =
            Number(
              btn.dataset.hours
            );


          loadHistory();
        }
      );

    }
  );


// ============================================================
// LIVE AGE MONITOR
// ============================================================

setInterval(
  () => {

    if (!lastLiveTimestamp) {
      return;
    }


    const age =
      (Date.now() -
        lastLiveTimestamp) /
      1000;


    $("updateAge").textContent =
      `LIVE • ${
        age < 2
          ? "just now"
          : ageText(
              lastLiveTimestamp
            )
      }`;


    // If no live message for 10 seconds
    if (age > 10) {

      setLiveStatus(
        "connecting",
        "STALE / RECONNECTING"
      );
    }

  },
  1000
);


// ============================================================
// START
// ============================================================

console.log(
  "========================================"
);

console.log(
  "BME280 AWS DASHBOARD STARTING"
);

console.log(
  "========================================"
);


// Load history immediately
loadHistory();


// Refresh history every 15 seconds
setInterval(
  loadHistory,
  15000
);


// Start live MQTT
startLiveMqtt();