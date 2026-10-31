CONTAINER_NAME ?= backend
MIGRATE_TABLE ?= all
N ?= 1
RUN_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))

# El convertim en un comando "fantasma" per evitar l'error "No rule to make target"
$(eval $(RUN_ARGS):;@:)

.PHONY: help up down restart bash logs migrate-up migrate-down migrate-status migrate-force migrate-create

##@ Help
help: ## Help
	@awk 'BEGIN {FS = ":.*##";} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Containers Managment
up: ## Start all containers
	docker-compose up -d

down: ## Stop and remove all containers
	docker-compose down

restart: ## Restart alls containers
	docker-compose restart $(RUN_ARGS)

bash: ## Exec bash into a specific container
	docker-compose exec $(RUN_ARGS) bash

logs: ## Get Logs of a container
	docker-compose logs -f --tail 50 $(RUN_ARGS)

##@ Migrations Managment
migrate-up: ## Applies all migrations
	docker-compose run --rm go_migrate up

migrate-down: ## Rollback N migrations
	docker-compose run --rm go_migrate down $(RUN_ARGS)

migrate-version: ## Give current migrate version
	docker-compose run --rm go_migrate version

migrate-force: ## Force to change to specific version
	docker-compose run --rm go_migrate force $(RUN_ARGS)

migrate-create: ## Creates a new migration
	 @read -p "Enter migration name: " NAME; \
	docker-compose run --rm go_migrate create -ext sql -dir /migrations -seq $${NAME}
