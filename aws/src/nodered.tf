resource "aws_ecs_task_definition" "nodered" {
  family = var.module_prefix

  container_definitions = jsonencode([
    {
      name: "nodered",
      cpu: 0,
      environment:  [],
      essential: true,
      image: "nodered/node-red:1.1.3",
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": var.log_group_name,
          "awslogs-region": var.aws_region,
          "awslogs-stream-prefix": "ecs-nodered"
        }
      },
      mountPoints: [],
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

  cpu          = 256
  memory       = 512
  network_mode = "awsvpc"

  execution_role_arn = var.ecs_task_execution_role_arn

  requires_compatibilities = ["FARGATE"]

  tags = var.tags
}

resource "aws_ecs_service" "nodered" {
  name            = var.module_prefix
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.nodered.arn
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.ecs_service_subnets
    security_groups = var.ecs_service_security_groups
  }

  desired_count = 1

  tags = var.tags
}
