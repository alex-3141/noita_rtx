#ifndef INCLUDE_MATERIAL
#define INCLUDE_MATERIAL

#include "../../lygia/color/luma.glsl"

// Material types
// Opaque               0
// Liquid				1
// Emissive             2
// Air or Gas           3

uint getMaterialType(vec4 color){
	uvec4 color_u = uvec4(color * 255.0);

	// Alpha values between 0.0 and 1.0 are fire particles
	// TODO: The exact alpha value may be from the RENDER_FIRE_GLOW_ALPHA magic number
	// Alpha values of 1.0 are liquids

	// Liquid. non-emissive
	if ((color_u.r & 64u) != 0u && color.a == 1.0){
		return 1u;
	}

	// Opaque
	if((color_u.r & 64u) != 0u){
		return 0u;
	}

	// ==== Firefly filtering ====

	// Kill superbright gas particles. These particles render closer to white than other particles
	if(color.a > 0.0 && color.a < 1.0 && dot(color.rgb, vec3(1.0)) > 0.4){
		return 3u;
	}

	// Kill materials very close to white.
	// There are white pixels like this in gold and some particles
	// TODO: This removes the white from material conversion effects.
	if(color.a == 0.0 && dot(normalize(color.rgb), normalize(vec3(1.0))) > 0.99){
		return 3u;
	}

	// This appears to be a unique alpha value for embers, which renders extremely red.
	// TODO: Use this to set a stable ember color instead of killing particle
	if(color.a == 63.0/255.0){
		return 3u;
	}


	// Colors that will crush to zero
	if(max(max(color_u.r, color_u.g), color_u.b) < 4u){
		return 3u;
	}

	// Remove dark fire particles

	// The "base" fire colors. There may be more.
	if(color_u.rgb == uvec3(7, 3, 3) || color_u.rgb == uvec3(7, 3, 1)){
		return 3u;
	}
	// Fire particles
	if(color.a > 0.0 && color.a < 1.0) {
		// Only keep colors above a certain brightness threshold
		if(luma(color.rgb) < 0.05) {
			return 3u;
		} else {
			return 2u;
		}
	}

	// Air / Gas
	if(color.rgb == vec3(0.0)){
		return 3u;
	};

	// Emissive
	if((color_u.r & 64u) == 0u){
		return 2u;
	}

	// No material identified, default to air
	return 3u;
}

uint sampleMaterial(ivec2 st){
	if (st.y < 120) {
		uint data = uint(texelFetch(BUFFER, st + ivec2(0, 120), 0).b * 255.0);
		return (data >> 6) & 0x3u;
	} else {
		uint data = uint(texelFetch(BUFFER, st, 0).b * 255.0);
		return (data >> 4) & 0x3u;
	}
}

uint sampleMaterial(vec2 pos){
	return sampleMaterial(ivec2(round(pos)));
}

float materialOcclusionFactor(uint material){
	if(material == 0u){
		return 0.89; // Opaque
	}
	if(material == 1u){
		return 0.97; // Liquid
	}
	if(material == 2u){
		return 0.91; // Emissive
	}

	return 1.0; // Air or gas
}


#endif