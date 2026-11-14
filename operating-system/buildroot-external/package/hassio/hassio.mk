################################################################################
#
# HAOS
#
################################################################################

HASSIO_VERSION = 1.0.0
HASSIO_LICENSE = Apache License 2.0
# HASSIO_LICENSE_FILES = $(BR2_EXTERNAL_HAOS_PATH)/../LICENSE
HASSIO_SITE = $(BR2_EXTERNAL_HAOS_PATH)/package/hassio
HASSIO_SITE_METHOD = local
HASSIO_VERSION_URL = "https://raw.githubusercontent.com/Ding-Ding-Projects/home-assistant-material/channel/"
ifeq ($(BR2_PACKAGE_HASSIO_CHANNEL_STABLE),y)
HASSIO_VERSION_CHANNEL = "stable"
else ifeq ($(BR2_PACKAGE_HASSIO_CHANNEL_BETA),y)
HASSIO_VERSION_CHANNEL = "beta"
else ifeq ($(BR2_PACKAGE_HASSIO_CHANNEL_DEV),y)
HASSIO_VERSION_CHANNEL = "dev"
endif

HASSIO_CONTAINER_IMAGES_ARCH = supervisor dns audio cli multicast observer core
HASSIO_PRELOAD_CORE_MACHINES = raspberrypi3-64 raspberrypi4-64 raspberrypi5-64

ifneq ($(strip $(HAOS_VERSION_JSON)),)
ifneq ($(filter $(HASSIO_PRELOAD_CORE_MACHINES),$(BR2_PACKAGE_HASSIO_MACHINE:"%"=%)),)
HASSIO_CONTAINER_IMAGES_ARCH += core_fallback
# The staging filesystem holds compressed content and unpacked snapshots.
HASSIO_DATA_IMAGE_SIZE = 6G
HASSIO_CORE_VERSION_FILTER = .core = (.homeassistant[$$machine] | strings | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$$"))) | .images.core_fallback = .images.core | .core_fallback = "landingpage"
endif
endif
HASSIO_CORE_VERSION_FILTER ?= .core = "landingpage"

define HASSIO_CONFIGURE_CMDS
	$(if $(HAOS_VERSION_JSON),cp "$(HAOS_VERSION_JSON)" "$(@D)/version-source.json",curl -fsSL $(HASSIO_VERSION_URL)$(HASSIO_VERSION_CHANNEL)".json" -o "$(@D)/version-source.json")
	jq -e --arg machine $(BR2_PACKAGE_HASSIO_MACHINE) '$(HASSIO_CORE_VERSION_FILTER)' \
		"$(@D)/version-source.json" > "$(@D)/version.json"
endef

define HASSIO_BUILD_CMDS
	$(Q)mkdir -p $(@D)/images
	$(Q)rm -f "$(@D)/images/"*.tar
	$(Q)mkdir -p $(HASSIO_DL_DIR)
	$(foreach image,$(HASSIO_CONTAINER_IMAGES_ARCH),\
		$(BR2_EXTERNAL_HAOS_PATH)/package/hassio/fetch-container-image.sh \
			$(BR2_PACKAGE_HASSIO_ARCH) $(BR2_PACKAGE_HASSIO_MACHINE) $(@D)/version.json $(image) "$(HASSIO_DL_DIR)" "$(@D)/images"
	)
endef

HASSIO_INSTALL_IMAGES = YES

define HASSIO_INSTALL_IMAGES_CMDS
	$(BR2_EXTERNAL_HAOS_PATH)/package/hassio/create-data-partition.sh "$(@D)" "$(BINARIES_DIR)" "$(HASSIO_VERSION_CHANNEL)" "$(DOCKER_ENGINE_VERSION)" "$(HASSIO_DATA_IMAGE_SIZE)"
endef

$(eval $(generic-package))
