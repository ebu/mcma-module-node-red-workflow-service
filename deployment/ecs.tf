resource "aws_ecs_cluster" "main" {
  name = var.global_prefix
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = format("%.64s", "${var.global_prefix}.${var.aws_region}.ecs.task_execution")
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

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
