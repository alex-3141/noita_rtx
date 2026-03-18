.DEFAULT_GOAL := zip
BUILD_DIR := build
STAGE_DIR := $(BUILD_DIR)/noita_rtx
ZIP_FILE := $(BUILD_DIR)/noita_rtx.zip

.PHONY: zip check-submodule clean

check-submodule:
	@if [ ! -f files/lib/nxml/nxml.lua ]; then \
		echo "Error: files/lib/nxml/nxml.lua not found."; \
		echo "Run: git submodule update --init --recursive"; \
		exit 1; \
	fi

zip: check-submodule
	@mkdir -p $(BUILD_DIR)
	@rm -rf $(STAGE_DIR) $(ZIP_FILE)
	@mkdir -p $(STAGE_DIR)
	@cp settings.lua mod.xml init.lua compatibility.xml $(STAGE_DIR)/
	@cp -R files $(STAGE_DIR)/
	@cp -R data $(STAGE_DIR)/
	@rm -rf $(STAGE_DIR)/files/lib/nxml
	@mkdir -p $(STAGE_DIR)/files/lib/nxml
	@cp files/lib/nxml/nxml.lua $(STAGE_DIR)/files/lib/nxml/nxml.lua
	@cd $(BUILD_DIR) && zip -rq noita_rtx.zip noita_rtx
	@echo "Created $(ZIP_FILE)"

clean:
	@rm -rf $(STAGE_DIR) $(ZIP_FILE)
