##################################
# aws_iam_role + aws_iam_policy
##################################

resource "aws_iam_role" "lambda_execution" {
  name               = format("%.64s", "${var.module_prefix}-${var.aws_region}-lambda-execution")
  path               = var.iam_role_path
  assume_role_policy = jsonencode({
    Version   : "2012-10-17",
    Statement : [
      {
        Sid       : "AllowLambdaAssumingRole"
        Effect    : "Allow"
        Action    : "sts:AssumeRole",
        Principal : {
          "Service" : "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_policy" "lambda_execution" {
  name   = format("%.128s", "${var.module_prefix}-${var.aws_region}-lambda-execution")
  path   = var.iam_policy_path
  policy = jsonencode({
    Version   = "2012-10-17",
    Statement = concat([
      {
        Sid      : "AllowLambdaWritingToLogs"
        Effect   : "Allow",
        Action   : "logs:*",
        Resource : "*"
      },
      {
        Sid      : "ListAndDescribeDynamoDBTables",
        Effect   : "Allow",
        Action   : [
          "dynamodb:List*",
          "dynamodb:DescribeReservedCapacity*",
          "dynamodb:DescribeLimits",
          "dynamodb:DescribeTimeToLive"
        ],
        Resource : "*"
      },
      {
        Sid      : "SpecificTable",
        Effect   : "Allow",
        Action   : [
          "dynamodb:BatchGet*",
          "dynamodb:DescribeStream",
          "dynamodb:DescribeTable",
          "dynamodb:Get*",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWrite*",
          "dynamodb:CreateTable",
          "dynamodb:Delete*",
          "dynamodb:Update*",
          "dynamodb:PutItem"
        ],
        Resource : [
          aws_dynamodb_table.service_table.arn,
          "${aws_dynamodb_table.service_table.arn}/index/*"
        ]
      },
      {
        Sid      : "AllowInvokingWorkerLambda",
        Effect   : "Allow",
        Action   : "lambda:InvokeFunction",
        Resource : "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${local.worker_lambda_name}"
      },
      {
        Sid      : "AllowInvokingApiGateway"
        Effect   : "Allow",
        Action   : "execute-api:Invoke",
        Resource : "arn:aws:execute-api:*:*:*"
      },
    ],
    var.xray_tracing_enabled ?
    [{
      Sid      : "AllowLambdaWritingToXRay"
      Effect   : "Allow",
      Action   : [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      Resource : "*"
    }]: [],
    var.dead_letter_config_target != null ?
    [{
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: var.dead_letter_config_target
    }] : [])
  })
}

resource "aws_iam_role_policy_attachment" "lambda_execution" {
  role       = aws_iam_role.lambda_execution.id
  policy_arn = aws_iam_policy.lambda_execution.arn
}

######################
# aws_dynamodb_table
######################

resource "aws_dynamodb_table" "service_table" {
  name         = var.module_prefix
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "partition_key"
  range_key    = "sort_key"

  attribute {
    name = "partition_key"
    type = "S"
  }

  attribute {
    name = "sort_key"
    type = "S"
  }

  tags = var.tags
}

#################################
#  aws_lambda_function : api_handler
#################################

resource "aws_lambda_function" "api_handler" {
  depends_on = [
    aws_iam_role_policy_attachment.lambda_execution
  ]

  filename         = "${path.module}/lambdas/api-handler.zip"
  function_name    = format("%.64s", replace("${var.module_prefix}-api-handler", "/[^a-zA-Z0-9_]+/", "-" ))
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/api-handler.zip")
  runtime          = "nodejs12.x"
  timeout          = "30"
  memory_size      = "3008"

  environment {
    variables = {
      LogGroupName     = var.log_group_name
      TableName        = aws_dynamodb_table.service_table.name
      PublicUrl        = local.service_url
      WorkerFunctionId = aws_lambda_function.worker.function_name
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

#################################
#  aws_lambda_function : worker
#################################

resource "aws_lambda_function" "worker" {
  depends_on = [
    aws_iam_role_policy_attachment.lambda_execution
  ]

  filename         = "${path.module}/lambdas/worker.zip"
  function_name    = local.worker_lambda_name
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/worker.zip")
  runtime          = "nodejs12.x"
  timeout          = "900"
  memory_size      = "3008"

  environment {
    variables = {
      LogGroupName          = var.log_group_name
      TableName             = aws_dynamodb_table.service_table.name
      PublicUrl             = local.service_url
      ServicesUrl           = var.service_registry.services_url
      ServicesAuthType      = var.service_registry.auth_type
    }
  }

  dynamic "dead_letter_config" {
    for_each = var.dead_letter_config_target != null ? toset([1]) : toset([])

    content {
      target_arn = var.dead_letter_config_target
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

##############################
#  aws_api_gateway_rest_api:  service_api
##############################
resource "aws_api_gateway_rest_api" "service_api" {
  name        = var.module_prefix
  description = "Node-RED Workflow Service Rest Api"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = var.tags
}

resource "aws_api_gateway_resource" "service_api" {
  rest_api_id = aws_api_gateway_rest_api.service_api.id
  parent_id   = aws_api_gateway_rest_api.service_api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "service_api_options" {
  rest_api_id   = aws_api_gateway_rest_api.service_api.id
  resource_id   = aws_api_gateway_resource.service_api.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "service_api_options" {
  rest_api_id = aws_api_gateway_rest_api.service_api.id
  resource_id = aws_api_gateway_resource.service_api.id
  http_method = aws_api_gateway_method.service_api_options.http_method
  status_code = "200"

  response_models = {
    "application/json" = "Empty"
  }

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration" "service_api_options" {
  rest_api_id = aws_api_gateway_rest_api.service_api.id
  resource_id = aws_api_gateway_resource.service_api.id
  http_method = aws_api_gateway_method.service_api_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{ \"statusCode\": 200 }"
  }
}

resource "aws_api_gateway_integration_response" "service_api_options" {
  rest_api_id = aws_api_gateway_rest_api.service_api.id
  resource_id = aws_api_gateway_resource.service_api.id
  http_method = aws_api_gateway_method.service_api_options.http_method
  status_code = aws_api_gateway_method_response.service_api_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT,PATCH,DELETE'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  response_templates = {
    "application/json" = ""
  }
}

resource "aws_api_gateway_method" "service_api_handler" {
  rest_api_id   = aws_api_gateway_rest_api.service_api.id
  resource_id   = aws_api_gateway_resource.service_api.id
  http_method   = "ANY"
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_integration" "service_api_handler" {
  rest_api_id             = aws_api_gateway_rest_api.service_api.id
  resource_id             = aws_api_gateway_resource.service_api.id
  http_method             = aws_api_gateway_method.service_api_handler.http_method
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${var.aws_region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${aws_lambda_function.api_handler.function_name}/invocations"
  integration_http_method = "POST"
}

resource "aws_lambda_permission" "service_api_handler" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handler.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:${var.aws_region}:${var.aws_account_id}:${aws_api_gateway_rest_api.service_api.id}/*/${aws_api_gateway_method.service_api_handler.http_method}/*"
}

resource "aws_api_gateway_deployment" "service_api_deployment" {
  depends_on = [
    aws_api_gateway_integration.service_api_options,
    aws_api_gateway_integration.service_api_handler,
    aws_api_gateway_integration_response.service_api_options,
  ]

  rest_api_id = aws_api_gateway_rest_api.service_api.id
}

resource "aws_api_gateway_stage" "service_gateway_stage" {
  stage_name           = var.stage_name
  deployment_id        = aws_api_gateway_deployment.service_api_deployment.id
  rest_api_id          = aws_api_gateway_rest_api.service_api.id
  xray_tracing_enabled = var.xray_tracing_enabled

  variables = {
    TableName        = aws_dynamodb_table.service_table.name
    PublicUrl        = local.service_url
    ServicesUrl      = var.service_registry.services_url
    ServicesAuthType = var.service_registry.auth_type
    WorkerFunctionId = aws_lambda_function.worker.function_name
  }

  tags = var.tags
}

resource "aws_api_gateway_method_settings" "service_gateway_settings" {
  rest_api_id = aws_api_gateway_rest_api.service_api.id
  stage_name  = aws_api_gateway_stage.service_gateway_stage.stage_name
  method_path = "*/*"

  settings {
    logging_level   = var.api_gateway_logging_enabled ? "INFO" : "OFF"
    metrics_enabled = var.api_gateway_metrics_enabled
  }
}

locals {
  service_url        = "https://${aws_api_gateway_rest_api.service_api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.stage_name}"
  service_auth_type  = "AWS4"
  worker_lambda_name = format("%.64s", replace("${var.module_prefix}-worker", "/[^a-zA-Z0-9_]+/", "-" ))
}
