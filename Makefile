.DEFAULT_GOAL := zip
BUILD_DIR := build
STAGE_DIR := $(BUILD_DIR)/noita_rtx
ZIP_FILE := $(BUILD_DIR)/noita_rtx.zip

.PHONY: zip check-submodule clean

check-submodule:
	@if [ ! -f nxml/nxml.lua ]; then \
		echo "Error: nxml/nxml.lua not found."; \
		echo "Run: git submodule update --init --recursive"; \
		exit 1; \
	fi

zip: check-submodule
	@mkdir -p $(BUILD_DIR)
	@rm -rf $(STAGE_DIR) $(ZIP_FILE)
	@mkdir -p $(STAGE_DIR)
	@cp -R src/* $(STAGE_DIR)/
	@mkdir -p $(STAGE_DIR)/files/lib/nxml
	@cp nxml/nxml.lua $(STAGE_DIR)/files/lib/nxml/nxml.lua
	@cd $(BUILD_DIR) && zip -rq noita_rtx.zip noita_rtx
	@echo "Created $(ZIP_FILE)"

clean:
	@rm -rf $(STAGE_DIR) $(ZIP_FILE)
