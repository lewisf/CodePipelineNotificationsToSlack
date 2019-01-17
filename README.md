# CodePipeline Notifications To Slack

## Installation

### New Lambda Function

1. Create a new Lambda function using the Node.js 6.10 runtime
2. Paste the contents of `index.js` into the Lambda function as "index.js". Make sure the "Handler" is `index.handler`
3. Generate a Slack Webhook URL from Slacks management pages for your Slack workspace.
4. Add an Environment Variable `SLACK_HOOK_URL` to match the Slack Webhook URL generated in Step 3.
5. Set Execution Role to a Role that has: *AWSLambdaBasicExecutionRole-\** and *AWSCodePipelineReadOnlyAccess*

### CloudWatch Events Trigger

1. Setup a CloudWatch Events Rule using the template below. Replace `your-pipeline-name` with the actual name of your pipeline.

```
{
  "source": [
    "aws.codepipeline"
  ],
  "detail-type": [
    "CodePipeline Stage Execution State Change"
  ],
  "detail": {
    "pipeline": [
      "your-pipeline-name"
    ]
  }
}
```
