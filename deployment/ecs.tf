resource "aws_ecs_cluster" "main" {
  name = var.global_prefix
}
