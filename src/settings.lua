---@diagnostic disable

dofile("data/scripts/lib/mod_settings.lua") -- see this file for documentation on some of the features.

local translations = {
  ["english"] = {
    ["title"] = "Noita RTX",
    ["exposure"] = "Exposure level",
    ["exposure_desc"] = "Multiplier applied to all light before mixing colors",
    ["ambient"] = "Ambient light level",
    ["ambient_desc"] = "Amount of ambient light added before mixing colors",
    ["dust"] = "Dust amount",
    ["dust_desc"] = "Amount of light added after mixing colors",
  },
}

local currentLang = GameTextGetTranslatedOrNot("$current_language")
local L = translations[currentLang] or translations.english

function push_uniforms()
  local exposure = ModSettingGetNextValue("noita_rtx.exposure")
  local ambient = ModSettingGetNextValue("noita_rtx.ambient")
  local dust = ModSettingGetNextValue("noita_rtx.dust")
  GameSetPostFxParameter("RTX_exposure_ambient_dust", exposure, ambient, dust, 0.0)
end

function mod_setting_change_callback( mod_id, gui, in_main_menu, setting, old_value, new_value  )
  if in_main_menu then
    return
  end

  push_uniforms()
end

local function render_settings()
  local mod_settings =
  {
    {
      id = "title",
      ui_name = L["title"],
      not_setting = true,
      ui_fn = text_title,
    },
    {
      id = "exposure",
      ui_name = L["exposure"],
      ui_description = L["exposure_desc"],
      value_default = 1.0,
      value_min = 0,
      value_max = 6.0,
      value_display_multiplier = 100,
      value_display_formatting = " $0%",
      scope = MOD_SETTING_SCOPE_RUNTIME,
      change_fn = mod_setting_change_callback,
    },
    {
      id = "ambient",
      ui_name = L["ambient"],
      ui_description = L["ambient_desc"],
      value_default = 0.08,
      value_min = 0.0,
      value_max = 1.0,
      value_display_multiplier = 100,
      value_display_formatting = " $0%",
      scope = MOD_SETTING_SCOPE_RUNTIME,
      change_fn = mod_setting_change_callback,
    },
    {
      id = "dust",
      ui_name = L["dust"],
      ui_description = L["dust_desc"],
      value_default = 0.002,
      value_min = 0.0,
      value_max = 0.025,
      value_display_multiplier = 1.0 / 0.025 * 100,
      value_display_formatting = " $0%",
      scope = MOD_SETTING_SCOPE_RUNTIME,
      change_fn = mod_setting_change_callback,
    },
  }
  return mod_settings
end

local mod_id = "noita_rtx" -- This should match the name of your mod's folder.
mod_settings_version = 1 -- This is a magic global that can be used to migrate settings to new mod versions. call mod_settings_get_version() before mod_settings_update() to get the old value. 
mod_settings = render_settings()

function ModSettingsUpdate( init_scope )
	local old_version = mod_settings_get_version( mod_id )
	mod_settings_update( mod_id, mod_settings, init_scope )
end

function ModSettingsGuiCount()
	return mod_settings_gui_count( mod_id, mod_settings )
end

function ModSettingsGui( gui, in_main_menu )
  local newLang = GameTextGetTranslatedOrNot("$current_language")
  if(newLang ~= currentLang) then
    currentLang = newLang
    L = translations[currentLang] or translations.english
    mod_settings = render_settings()
  end

	mod_settings_gui( mod_id, mod_settings, gui, in_main_menu )
end
