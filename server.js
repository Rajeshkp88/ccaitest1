const express = require('express');
const request = require('request');
const app = express();

app.use(express.json());

// Uncomment and insert your values here
const sparkAccessToken = "MWIwMmI3NTEtMjU2Yy00ZmQyLWJiNGUtMmQxZjRjOWY4ZGUwMDM2MjQwOGItYTgz_PF84_1eb65fdf-9643-417f-9974-ad72cae0e10f";
const targetUrl = 'https://dialogflow.cloud.google.com/cx/projects/test-ccai-429020/locations/us-central1/agents/3618cc92-4702-4156-bbd0-693f80d81a31';
const projectId = 'test-ccai-429020';
const locationId = 'us-central1';
const agentId = '3618cc92-4702-4156-bbd0-693f80d81a31';
const languageCode = 'en';

// Imports the Google Cloud Some API library
const { SessionsClient } = require('@google-cloud/dialogflow-cx');
/**
 * Example for regional endpoint:
 *   const locationId = 'us-central1'
 *   const client = new SessionsClient({apiEndpoint: 'us-central1-dialogflow.googleapis.com'})
 */
const client = new SessionsClient({ apiEndpoint: locationId + '-dialogflow.googleapis.com' });

// Upon start a webhook is registered with spark
// Upon closure the webhook is removed from spark

const listener = app.listen(process.env.PORT, async function () {
  await init();
  console.log('Your Spark integration server is listening on port ' +
    listener.address().port);
});

app.post('/', async function (req, res) {
  const message = await retrieveMessage(req.body.data.id);
  if (message == null) {
    res.sendStatus(200);
  }
  const dialogflowResponse = await detectIntentText(message);
  const sparkMessage = detectIntentToSparkMessage(dialogflowResponse, message);
  sendMessage(sparkMessage);
  res.sendStatus(200);
});

process.on('SIGTERM', () => {
  listener.close(async () => {
    console.log('Closing http server.');
    await deleteWebhooksByUrl(targetUrl);
    process.exit(0);
  });
});

async function init() {
  await deleteWebhooksByUrl(targetUrl);
  registerWebhook();
}

// Converts Spark message to a detectIntent request.
function sparkToDetectIntent(message, sessionPath) {
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: message.text,
      },
      languageCode,
    },
  };

  return request;
}

// Converts detectIntent response to a Spark text message.
function detectIntentToSparkMessage(response, message) {
  agentResponse = '';

  for (const message of response.queryResult.responseMessages) {
    if (message.text) {
      agentResponse += `${message.text.text}\n`;
    };
  };

  if (agentResponse.length != '') {
    const request = {
      toPersonEmail: message.email,
      text: agentResponse,
    };
    return request;
  };
};

/**
 * This function calls Dialogflow CX API to retrieve the response
 * https://cloud.google.com/dialogflow/cx/docs/quick/api
 */
async function detectIntentText(message) {
  const sessionId = message.payload.personId;
  const sessionPath = client.projectLocationAgentSessionPath(
    projectId,
    locationId,
    agentId,
    sessionId,
  );
  console.info(sessionPath);

  const request = sparkToDetectIntent(message, sessionPath);
  const [response] = await client.detectIntent(request);

  return response;
}

function sendMessage(message) {
  request.post('https://api.ciscospark.com/v1/messages', {
    auth: {
      bearer: sparkAccessToken,
    },
    json: message,
  }, (err, resp, body) => {
    if (err) {
      console.error('Failed to send message :' + err);
    }
  });
}

function registerWebhook() {
  request.post('https://api.ciscospark.com/v1/webhooks', {
    auth: {
      bearer: sparkAccessToken,
    },
    json: {
      'name': 'test',
      'targetUrl': targetUrl,
      'resource': 'messages',
      'event': 'created',
    },
  }, (err, resp, body) => {
    if (err) {
      console.error('Failed to create Webhook :' + err);
    }
  });
}

async function deleteWebhooksByUrl(targetUrl) {
  const webhooks = await listWebhooks(targetUrl);
  for (webhook of webhooks) {
    if (webhook.id) {
      await deleteWebhookById(webhook.id);
    }
  }
}

function deleteWebhookById(webhookId) {
  return new Promise((resolve, reject) => {
    request.delete(
      'https://api.ciscospark.com/v1/webhooks/' +
      webhookId, {
      auth: {
        bearer: sparkAccessToken,
      },
    }, (err, resp, body) => {
      if (err) {
        console.error('Failed to delete webhook :' + err);
        reject(err);
      }
      resolve();
    });
  });
}

function listWebhooks(targetUrl) {
  return new Promise((resolve, reject) => {
    request.get('https://api.ciscospark.com/v1/webhooks?max=100', {
      auth: {
        bearer: sparkAccessToken,
      },
    }, (err, resp, body) => {
      if (err) {
        console.error('Failed to check webhooks :' + err);
        reject(err);
      }
      let webhooks = JSON.parse(resp.body).items;
      if (Array.isArray(webhooks)) {
        webhooks = webhooks.filter((value, index, arr) => {
          return value.targetUrl === targetUrl;
        });
        resolve(webhooks);
      }
      resolve([]);
    });
  });
}

function retrieveMessage(messageId) {
  return new Promise((resolve, reject) => {
    request.get('https://api.ciscospark.com/v1/messages/' + messageId, {
      auth: {
        bearer: sparkAccessToken,
      },
    }, (err, resp, body) => {
      if (err) {
        console.error('Failed to retrieve message :' + err);
        reject();
      }
      // checks to make sure the message is not from itself
      if (!((JSON.parse(resp.body).personEmail).includes('webex.bot'))) {
        const personEmail = JSON.parse(resp.body).personEmail;
        const messageText = JSON.parse(resp.body).text;
        const payload = JSON.parse(resp.body);
        resolve({ text: messageText, email: personEmail, payload: payload });
      } else {
        resolve(null);
      }
    });
  });
}

module.exports = { sparkToDetectIntent, detectIntentToSparkMessage };
