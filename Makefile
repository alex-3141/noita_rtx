.DEFAULT_GOAL := zip
SRC_DIR := src
BUILD_DIR := build
STAGE_DIR := $(BUILD_DIR)/noita_rtx
PRE_DIR := $(BUILD_DIR)/pre
ZIP_FILE := $(BUILD_DIR)/noita_rtx.zip
INSTALL_DIR ?=

NXML := nxml/nxml.lua
LYGIA_CHECK := lygia/math.glsl
POST_FINAL_ORIGINAL := gamedata/shaders/post_final.frag

SOURCES := compatibility.xml init.lua mod_id.txt mod.xml settings.lua config.lua files/constants.lua files/materials.lua files/rtx.lua files/scanner.lua files/sdf.lua files/texture.lua files/shader.lua files/lights.lua
STATIC_SHADERS := post_glow1.frag post_glow2.frag
DYNAMIC_SHADERS := post_final.frag

LUA_TARGETS := $(addprefix $(STAGE_DIR)/, $(SOURCES)) $(NXML)
LUA_LIB_TARGETS := $(addprefix $(STAGE_DIR)/files/lib/, $(notdir $(NXML)))

STATIC_SHADER_TARGETS := $(addprefix $(STAGE_DIR)/data/shaders/, $(STATIC_SHADERS))
PATCH_SHADER_TARGETS := $(addprefix $(STAGE_DIR)/files/patches/, $(DYNAMIC_SHADERS:.frag=.frag.patch.lua))
SHADER_TARGETS := $(STATIC_SHADER_TARGETS) $(PATCH_SHADER_TARGETS)
DEV_SHADER_TARGETS := $(addprefix $(STAGE_DIR)/data/shaders/, $(DYNAMIC_SHADERS))

.PHONY: zip build install check-submodules check-gamedata clean purge

zip: build
	@rm -f $(ZIP_FILE)
	@cd $(BUILD_DIR) && zip -rq $(notdir $(ZIP_FILE)) $(notdir $(STAGE_DIR))
	@echo "Created $(ZIP_FILE)"

build: check-submodules $(LUA_TARGETS) $(LUA_LIB_TARGETS) $(SHADER_TARGETS)

install-dev: check-install-dir dev
	@mkdir -p "$(INSTALL_DIR)"
	@cp -r "$(STAGE_DIR)/." "$(INSTALL_DIR)/"
	@echo "Installed $(STAGE_DIR) to $(INSTALL_DIR)"

dev: check-gamedata build $(DEV_SHADER_TARGETS)
	@sed -i 's/hot_reload = false/hot_reload = true/' $(STAGE_DIR)/config.lua

install: build check-install-dir
	@mkdir -p "$(INSTALL_DIR)"
	@cp -r "$(STAGE_DIR)/." "$(INSTALL_DIR)/"
	@echo "Installed $(STAGE_DIR) to $(INSTALL_DIR)"

check-install-dir:
	@if [ -z "$(INSTALL_DIR)" ]; then \
		echo "Error: INSTALL_DIR not set."; \
		echo "Set INSTALL_DIR to the path of your Noita mods directory, e.g. /path/to/noita/mods/noita_rtx"; \
		exit 1; \
	fi

check-submodules:
	@if [ ! -f $(NXML) ]; then \
		echo "Error: $(NXML) not found."; \
		echo "Run git submodule update --init --recursive, or place NXML under nxml/"; \
		exit 1; \
	fi
	@if [ ! -f $(LYGIA_CHECK) ]; then \
		echo "Error: Lygia library not found."; \
		echo "Run git submodule update --init --recursive, or place Lygia under lygia/"; \
		exit 1; \
	fi

check-gamedata:
	@if [ ! -f $(POST_FINAL_ORIGINAL) ]; then \
		echo "Error: $(POST_FINAL_ORIGINAL) not found."; \
		echo "Please place an unmodified post_final.frag at $(POST_FINAL_ORIGINAL)"; \
		exit 1; \
	fi

# Mod files
$(STAGE_DIR)/%: src/%
	@mkdir -p $(@D)
	@cp $< $@

# NXML
$(STAGE_DIR)/files/lib/nxml.lua: $(NXML)
	@mkdir -p $(@D)
	@cp $< $@

# Shader preprocessing
$(PRE_DIR)/%.frag: shaders/%.frag
	@mkdir -p $(@D)
	@echo "Resolving Lygia includes for $<..."
	@luajit lib/resolve_lygia_includes.lua $< $@

# Static shaders
$(STAGE_DIR)/data/shaders/%.frag: $(PRE_DIR)/%.frag
	@mkdir -p $(@D)
	@cp $< $@

# Shader diffs
$(STAGE_DIR)/files/patches/%.frag.patch.lua: $(PRE_DIR)/%.frag gamedata/shaders/%.frag
	@mkdir -p $(@D)
	@echo "Generating diff for $<..."
	@luajit lib/generate_patches.lua $< $@

# Dev shaders (patches applied at build time)
$(STAGE_DIR)/data/shaders/post_final.frag: $(STAGE_DIR)/files/patches/post_final.frag.patch.lua gamedata/shaders/post_final.frag
	@mkdir -p $(@D)
	@echo "Generating patched shader for post_final.frag..."
	@luajit lib/apply_patches.lua gamedata/shaders/post_final.frag $< $@

clean:
	@rm -rf $(STAGE_DIR) $(PRE_DIR) $(ZIP_FILE)

purge:
	@rm -rf $(BUILD_DIR)
