resource "aws_iam_role" "nodered_execution" {
  name               = format("%.64s", "${var.module_prefix}-${var.aws_region}-ecs-task-execution")
  assume_role_policy = jsonencode({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "ecs-tasks.amazonaws.com"
        },
        Effect: "Allow"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "nodered_execution" {
  role       = aws_iam_role.nodered_execution.id
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "nodered_task" {
  name               = format("%.64s", "${var.module_prefix}-${var.aws_region}-task")
  assume_role_policy = jsonencode({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "ecs-tasks.amazonaws.com"
        },
        Effect: "Allow"
      }
    ]
  })
}

resource "aws_iam_policy" "nodered_task" {
  name   = format("%.128s", "${var.module_prefix}-${var.aws_region}-task")
  path   = var.iam_policy_path
  policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [
      {
        Sid      : "AllowWritingToLogs"
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
        Sid      : "AllowInvokingApiGateway",
        Effect   : "Allow",
        Action   : "execute-api:Invoke",
        Resource : "arn:aws:execute-api:*:*:*"
      },
      {
        Sid : "AllowRunningInVPC",
        Effect: "Allow",
        Action: [
          "ec2:DescribeNetworkInterfaces",
          "ec2:CreateNetworkInterface",
          "ec2:DeleteNetworkInterface"
        ]
        Resource: "*"
      },
      {
        Sid: "MountEFS",
        Effect: "Allow",
        Action: [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientRootAccess",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:DescribeMountTargets"
        ]
        Resource: aws_efs_file_system.nodered.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "nodered_task" {
  role       = aws_iam_role.nodered_task.id
  policy_arn = aws_iam_policy.nodered_task.arn
}

resource "aws_iam_role_policy_attachment" "nodered_task_additional" {
  role       = aws_iam_role.nodered_task.id
  policy_arn = var.nodered_iam_policy_arn
  count      = var.nodered_iam_policy_arn != null ? 1 : 0
}

resource "aws_ecs_task_definition" "nodered" {
  family = var.module_prefix

  container_definitions = jsonencode([
    {
      name: "node-red",
      cpu: 0,
      environment: concat(var.nodered_environment_variables, [
        {
          name: "LogGroupName",
          value: var.log_group.name
        },
        {
          name: "ServicesUrl",
          value: var.service_registry.services_url
        },
        {
          name: "ServicesAuthType",
          value: var.service_registry.auth_type
        }]),
      essential: true,
      image: "nodered/node-red:1.2.2",
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": var.log_group.name,
          "awslogs-region": var.aws_region,
          "awslogs-stream-prefix": "ecs"
        }
      },
      mountPoints: [
        {
          sourceVolume: "nodered-data"
          containerPath: "/data"
        }
      ],
      portMappings: [
        {
          containerPort: 1880,
          hostPort: 1880,
          protocol: "tcp"
        }
      ],
      volumesFrom: []
    }
  ])

  volume {
    name = "nodered-data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.nodered.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.nodered.id
        iam             = "ENABLED"
      }
    }
  }

  cpu          = 256
  memory       = 512
  network_mode = "awsvpc"

  execution_role_arn = aws_iam_role.nodered_execution.arn
  task_role_arn      = aws_iam_role.nodered_task.arn

  requires_compatibilities = ["FARGATE"]

  tags = var.tags
}

resource "aws_ecs_service" "nodered" {
  name             = var.module_prefix
  cluster          = var.ecs_cluster.id
  task_definition  = aws_ecs_task_definition.nodered.arn
  launch_type      = "FARGATE"
  platform_version = "1.4.0"

  network_configuration {
    subnets         = var.ecs_service_subnets
    security_groups = var.ecs_service_security_groups
  }

  desired_count = 1

  tags = var.tags
}

resource "aws_efs_file_system" "nodered" {
  tags = merge(var.tags, {
    Name = var.module_prefix
  })
}

resource "aws_efs_mount_target" "nodered" {
  file_system_id  = aws_efs_file_system.nodered.id
  subnet_id       = var.ecs_service_subnets[0]
  security_groups = var.ecs_service_security_groups
}

resource "aws_efs_access_point" "nodered" {
  file_system_id = aws_efs_file_system.nodered.id

  posix_user {
    gid = 1000
    uid = 1000
  }

  root_directory {
    path = "/nodered"

    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = 755
    }
  }

  tags = merge(var.tags, {
    Name = var.module_prefix
  })
}
