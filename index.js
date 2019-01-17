const AWS = require('aws-sdk');
const https = require('https');
const url = require('url');

var codePipeline = new AWS.CodePipeline();

const slackUrl = process.env.SLACK_HOOK_URL;
const slackRequestOptions = url.parse(slackUrl);
slackRequestOptions.method = 'POST';
slackRequestOptions.headers = {
  'Content-Type': 'application/json'
};

function getExecutionRevisionDetails(pipelineName, pipelineExecutionId) {
  return codePipeline
    .getPipelineExecution({
      pipelineName: pipelineName,
      pipelineExecutionId: pipelineExecutionId
    })
    .promise()
    .then(response => {
      const {pipelineExecution} = response;
      if (pipelineExecution.artifactRevisions.length > 0) {
        const artifactRevision = pipelineExecution.artifactRevisions[0];
        const {
          name,
          revisionId,
          revisionSummary,
          revisionUrl
        } = artifactRevision;

        return {
          name: name,
          commit: revisionId,
          description: revisionSummary,
          url: revisionUrl
        };
      } else {
        return null;
      }
    });
}

function getStageMetadata(pipelineName, stageName) {
  return codePipeline
    .getPipeline({name: pipelineName})
    .promise()
    .then(response => {
      const stages = response.pipeline.stages;
      const index = stages.findIndex(stage => stage.name === stageName);
      const total = stages.length;

      return {
        pipeline: pipelineName,
        stage: stageName,
        stageIndex: index + 1,
        totalStages: total
      };
    });
}

const GREY = '#d0d0d0';
const BLUE = '#67d4e2';
const GREEN = '#54a158';
const RED = '#c3291c';
const YELLOW = '#d5a048';

function getStageStateColor(state) {
  switch (state) {
    case 'STARTED':
      return GREY;
    case 'SUCCEEDED':
      return GREEN;
    case 'RESUMED':
      return BLUE;
    case 'FAILED':
      return RED;
    case 'CANCELLED':
      return YELLOW;
  }
}

function getPipelineStateColor(state) {
  switch (state) {
    case 'STARTED':
      return GREY;
    case 'SUCCEEDED':
      return GREEN;
    case 'RESUMED':
      return BLUE;
    case 'FAILED':
      return RED;
    case 'CANCELLED':
      return YELLOW;
    case 'SUPERCEDED':
      return BLUE;
  }
}

function ucFirst(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getMessageForPipelineExecutionStateChange(
  pipelineName,
  pipelineExecutionId,
  state,
  time
) {
  return getExecutionRevisionDetails(pipelineName, pipelineExecutionId).then(
    metadata => {
      const {commit, description, url, name} = metadata;

      return {
        attachments: [
          {
            color: getPipelineStateColor(state),
            title: `Building and deploying: <${url}|${name}@${commit.slice(
              0,
              7
            )}>`,
            text: `${description}`,
            mrkdwn_in: ['text', 'title'],
            fields: [
              {
                title: 'Pipeline',
                value: `<https://console.aws.amazon.com/codepipeline/home?region=us-east-1#/view/${pipelineName}|${pipelineName}>`,
                short: true
              },
              {
                title: 'Execution Id',
                value: pipelineExecutionId,
                short: true
              },
              {
                title: 'State',
                value: ucFirst(state.toLowerCase()),
                short: true
              }
            ],
            ts: time
          }
        ]
      };
    }
  );
}

function getMessageForActionExecutionStateChange() {
  // NOT IMPLEMENTED
}

function getMessageForStageExecutionStateChange(
  pipelineName,
  stageName,
  state
) {
  return getStageMetadata(pipelineName, stageName).then(metadata => {
    const {stageIndex, totalStages} = metadata;

    return {
      attachments: [
        {
          color: getStageStateColor(state),
          title: `Pipeline: ${ucFirst(
            pipelineName
          )}, Stage: ${stageName} (${stageIndex}/${totalStages}), State: ${ucFirst(
            state.toLowerCase()
          )}`,
          title_link: `https://console.aws.amazon.com/codepipeline/home?region=us-east-1#/view/${pipelineName}`
        }
      ]
    };
  });
}

exports.handler = function(event, context, callback) {
  console.log('Received event:', JSON.stringify(event, null, 2));
  const {pipeline, state, 'execution-id': executionId} = event.detail;

  switch (event['detail-type']) {
    // case "CodePipeline Pipeline Execution State Change":
    //   const {
    //     "execution-id": executionId,
    //   } = event.detail;
    //   return getMessageForPipelineExecutionStateChange(pipeline, executionId, state, event.time)
    //     .then(message => {
    //       var req = https.request(slackRequestOptions, function (res) {
    //         if (res.statusCode === 200) {
    //           callback(null, 'posted to slack');
    //         } else {
    //           callback('status code: ' + res.statusCode);
    //         }
    //       });

    //       req.on('error', function (e) {
    //         callback(e.message);
    //       });

    //       req.write(JSON.stringify(message));

    //       req.end();
    //     });
    case 'CodePipeline Stage Execution State Change':
      const {stage} = event.detail;

      if (stage === 'build') {
        getExecutionRevisionDetails(pipeline, executionId).then(metadata => {
          const {commit, description, url, name} = metadata;

          const message = {
            attachments: [
              {
                title: `Building and deploying: <${url}|${name}@${commit.slice(
                  0,
                  7
                )}>`,
                text: `${description}`,
                mrkdwn_in: ['text', 'title']
              }
            ]
          };

          var req = https.request(slackRequestOptions, function(res) {
            if (res.statusCode === 200) {
              console.log('posted build metadata to slack');
            } else {
              console.error('status code: ' + res.statusCode);
            }
          });

          req.on('error', function(e) {
            console.error(e.message);
          });

          req.write(JSON.stringify(message));
          req.end();
        });
      }

      return getMessageForStageExecutionStateChange(
        pipeline,
        stage,
        state
      ).then(message => {
        var req = https.request(slackRequestOptions, function(res) {
          if (res.statusCode === 200) {
            callback(null, 'posted to slack');
          } else {
            callback('status code: ' + res.statusCode);
          }
        });

        req.on('error', function(e) {
          callback(e.message);
        });

        req.write(JSON.stringify(message));
        req.end();
      });
  }
};
