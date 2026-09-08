.PHONY: plugin front back all clean plugin-deploy test release dev docker-build docker-up docker-down

PLUGIN_DIR = plugin
WEB_DIR = web
GO_CMD = cmd/obsipub
DISTRIB = distrib

# Configurable for local test/manual workflow (no hardcoded secrets)
OBSIPUB_API_KEY ?= 
OBSIPUB_ROOT ?= notes
OBSIPUB_PORT ?= 8088
OBSIPUB_HOST ?= localhost
OBSIPUB_TRUSTED_PROXIES ?= 


GOCACHE ?= /tmp/obsipub-go-cache

plugin:
	@mkdir -p $(PLUGIN_DIR)/dist
	cd $(PLUGIN_DIR) && npm run build

front:
	cd $(WEB_DIR) && npm run build

plugin-deploy:
	cd $(PLUGIN_DIR) && npm run deploy

back:
	@if [ -n "$(OBSIPUB_API_KEY)" ]; then key_status=yes; else key_status=no; fi; \
		echo "Starting backend (API_KEY set=$$key_status, ROOT=$(OBSIPUB_ROOT), PORT=$(OBSIPUB_PORT), HOST=$(OBSIPUB_HOST), TRUSTED_PROXIES=$(OBSIPUB_TRUSTED_PROXIES))"
	OBSIPUB_API_KEY="$(OBSIPUB_API_KEY)" OBSIPUB_ROOT="$(OBSIPUB_ROOT)" OBSIPUB_PORT="$(OBSIPUB_PORT)" OBSIPUB_HOST="$(OBSIPUB_HOST)" OBSIPUB_TRUSTED_PROXIES="$(OBSIPUB_TRUSTED_PROXIES)" go run ./$(GO_CMD)

all: release

test:
	@mkdir -p $(GOCACHE)
	GOCACHE=$(GOCACHE) go test ./...
	cd $(PLUGIN_DIR) && npm test
	cd $(WEB_DIR) && npm run build

dev: release plugin-deploy
	OBSIPUB_API_KEY="$(OBSIPUB_API_KEY)" OBSIPUB_ROOT="$(OBSIPUB_ROOT)" OBSIPUB_PORT="$(OBSIPUB_PORT)" OBSIPUB_HOST="$(OBSIPUB_HOST)" OBSIPUB_TRUSTED_PROXIES="$(OBSIPUB_TRUSTED_PROXIES)" ./$(DISTRIB)/obsipub

release:
	@mkdir -p $(DISTRIB) $(DISTRIB)/plugin $(DISTRIB)/web
	$(MAKE) plugin front
	@mkdir -p $(DISTRIB)
	GOCACHE=$(GOCACHE) go build -o $(DISTRIB)/obsipub ./$(GO_CMD)
	cp -r $(PLUGIN_DIR)/dist/* $(DISTRIB)/plugin/
	cp -r $(WEB_DIR)/dist/* $(DISTRIB)/web/
	@echo "Release built in $(DISTRIB) with plugin, web, and binary."

docker-build:
	docker compose build

docker-up:
	docker compose up --build

docker-down:
	docker compose down

clean:
	rm -rf $(DISTRIB) $(PLUGIN_DIR)/dist $(WEB_DIR)/dist
