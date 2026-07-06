#version 400
#extension GL_ARB_gpu_shader5 : enable

// inputs
uniform sampler2D 	tex_glow_source;
uniform sampler2D 	tex_glow_source_particles;
uniform sampler2D 	tex_glow_prev_frame;
uniform vec2        one_per_glow_texture_size;
uniform float		time;

out vec4 outColor;

#define BUFFER tex_glow_prev_frame

// Lygia includes
#include "../lygia/math/const.glsl"
#include "../lygia/color/space/srgb2rgb.glsl"
#include "../lygia/color/space/rgb2srgb.glsl"
#include "../lygia/color/luminance.glsl"

// Other includes
#include "./lib/common.frag"
#include "./lib/vbuffer.frag"
#include "./lib/material.frag"
#include "./lib/sdf.frag"

// ============================================================================

vec2 uv = gl_FragCoord.xy / GLOW_BOUNDS;

vec3 advance_frame(){
	int frame = get_frame();
	frame += 1;
	vec3 color = vec3(
		(frame % 256) / 255.0,
		(frame / 256 % 256) / 255.0,
		(frame / 256 / 256 % 256) / 255.0
	);
	return color;
}

float downsampleEmitters(ivec2 st){
	for(int y = st.y * 4; y < st.y * 4 + 4; y++){
		for(int x = st.x * 4; x < st.x * 4 + 4; x++){
			if(getMaterialType(texelFetch(tex_glow_source, ivec2(x, y), 0)) == 2u){
				return 1.0;
			}
		}
	}

	return 0.0;
}

uint getMaterial(ivec2 st) {
	uint mat_here = getMaterialType(texelFetch(tex_glow_source, st, 0));

	// Expand size of emitters to make them easier for rays to hit, and to reduce aliasing
	// This needs to be adjusted in-step with the "Internal rays" part of raymarching
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2(-1, -1), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2(-1,  0), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2(-1,  1), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2( 0, -1), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2( 0,  0), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2( 0,  1), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2( 1, -1), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2( 1,  0), 0)) == 2u) return 2u;
	if(getMaterialType(texelFetch(tex_glow_source, st + ivec2( 1,  1), 0)) == 2u) return 2u;

	return mat_here;
}

uvec3 sample_glow_source_st(ivec2 st){
	vec4 s = texelFetch(tex_glow_source, st, 0);

	// Disregard non-emissive particles. This also filters out undesired colors
	if(getMaterialType(s) != 2u) {
		return uvec3(0u);
	}

	uvec4 color_u = uvec4(s * 255.0);

    // Strip non-color bits
    color_u = color_u & 0x7F;

	// Crush from 6 bits to 4 bits
	color_u = (color_u / 4) & 0xF;

    return color_u.rgb;
}

// A large area needs to be covered so that the top and bottom rows are able to
// capture the color from the top 2 and bottom 2 rows of the source buffer. This also
// reduces the chance of color lookups missing.
// TODO: This only needs to be done for the edges, saving a lot of texture lookups
uvec3 sample_glow_source_color_st_average_r2(ivec2 st){
	const int radius = 2;
	const int xLimits[3] = int[3](2, 2, 1);

	uvec3 sum = uvec3(0u);
	uint count = 0u;

	for(int y = -radius; y <= radius; y++){
		int xLimit = xLimits[abs(y)];
		for(int x = -xLimit; x <= xLimit; x++){
			uvec3 s = sample_glow_source_st(st + ivec2(x, y));
			if(s != uvec3(0u)){
				sum += s;
				count++;
			}
		}
	}

	if(count == 0u){
		return uvec3(0u);
	}

	return sum / count;
}

uvec3 sample_glow_source_color_st_average_r4(ivec2 st){
	const int radius = 4;
	const int xLimits[5] = int[5](4, 3, 3, 2, 0);

	uvec3 sum = uvec3(0u);
	uint count = 0u;

	for(int y = -radius; y <= radius; y++){
		int xLimit = xLimits[abs(y)];
		for(int x = -xLimit; x <= xLimit; x++){
			uvec3 s = sample_glow_source_st(st + ivec2(x, y));
			if(s != uvec3(0u)){
				sum += s;
				count++;
			}
		}
	}

	if(count == 0u){
		return uvec3(0u);
	}

	return sum / count;
}

uvec3 sample_glow_source_color_st_average_r6(ivec2 st){
	const int radius = 6;
	const int xLimits[7] = int[7](6, 6, 6, 5, 5, 4, 2);

	uvec3 sum = uvec3(0u);
	uint count = 0u;

	for(int y = -radius; y <= radius; y++){
		int xLimit = xLimits[abs(y)];
		for(int x = -xLimit; x <= xLimit; x++){
			uvec3 s = sample_glow_source_st(st + ivec2(x, y));
			if(s != uvec3(0u)){
				sum += s;
				count++;
			}
		}
	}

	if(count == 0u){
		return uvec3(0u);
	}

	return sum / count;
}


uvec3 sample_glow_source_color_st_average_r8(ivec2 st){
	const int radius = 8;
	const int xLimits[9] = int[9](8, 7, 7, 7, 6, 6, 5, 3, 0);

	uvec3 sum = uvec3(0u);
	uint count = 0u;

	for(int y = -radius; y <= radius; y++){
		int xLimit = xLimits[abs(y)];
		for(int x = -xLimit; x <= xLimit; x++){
			uvec3 s = sample_glow_source_st(st + ivec2(x, y));
			if(s != uvec3(0u)){
				sum += s;
				count++;
			}
		}
	}

	if(count == 0u){
		return uvec3(0u);
	}

	return sum / count;
}

uvec3 sample_glow_source_st_average(ivec2 st){
	// return sample_glow_source_color_st_average_r2(st);
	// return sample_glow_source_color_st_average_r4(st);
	// return sample_glow_source_color_st_average_r6(st);
	return sample_glow_source_color_st_average_r8(st);
}

// TODO: Use Lygia imported version
vec3 smartDeNoise(vec2 uv, vec2 pixel, float sigma, float kSigma, float threshold) {
    float radius = floor(kSigma*sigma + 0.5);
    float radQ = radius * radius;

    float invSigmaQx2 = 0.5 / (sigma * sigma);      // 1.0 / (sigma^2 * 2.0)
    float invSigmaQx2PI = INV_PI * invSigmaQx2;    // 1.0 / (sqrt(PI) * sigma)

    float invThresholdSqx2 = 0.5 / (threshold * threshold);  // 1.0 / (sigma^2 * 2.0)
    float invThresholdSqrt2PI = INV_SQRT_TAU / threshold;   // 1.0 / (sqrt(2*PI) * sigma)

    vec3 centrPx = sample_hdr_buffer(uv);

    float zBuff = 0.0;
    vec3 aBuff = vec3(0.0);
    for(float x=-radius; x <= radius; x++) {
        // circular kernel
        float pt = sqrt(radQ-x*x);
        for(float y=-pt; y <= pt; y++) {
            vec2 d = vec2(x,y);

            // gaussian factor
            float blurFactor = exp( -dot(d , d) * invSigmaQx2 ) * invSigmaQx2PI;
            vec3 walkPx = sample_hdr_buffer(uv+d*pixel);

            // adaptive
            vec3 dC = walkPx-centrPx;
            float deltaFactor = exp( -dot(dC, dC) * invThresholdSqx2) * invThresholdSqrt2PI * blurFactor;

            zBuff += deltaFactor;
            aBuff += deltaFactor*walkPx;
        }
    }
    return aBuff/zBuff;
}

// Color data is only 4 bits per channel, so we store 2 colors per pixel
vec3 store_color(ivec2 vbuf_st){
	// Here we are doing a 2x downscale, while also cutting off the top and bottom rows.
	// The top and bottom rows are compressed into the edges.
	ivec2 scaled_st = vbuf_st * 2;
	scaled_st += ivec2(0, 2); // 2 to account for the * 2 in prev step

    ivec2 color_0_st = scaled_st;
    ivec2 color_1_st = scaled_st + ivec2(0, 120);


	uvec3 color_0 = sample_glow_source_st_average(color_0_st) & 0xF;
	uvec3 color_1 = sample_glow_source_st_average(color_1_st) & 0xF;

	// Test pattern should appear magenta
	// color_0 = uvec3(15u, 15u, 0u);
	// color_1 = uvec3(0u, 15u, 15u);

    uvec3 pack = uvec3(
        color_0.r << 4 | color_0.g,
        color_0.b << 4 | color_1.r,
        color_1.g << 4 | color_1.b
    );

    return vec3(pack) / 255.0;
}


vec3 downsample_particle_glow(vec2 uv){
	vec2 particle_uv = vec2(uv.x, 1.0 - uv.y);
	vec3 particle_glow = vec3(0.0);
	vec2 p = 1.0 / vec2(430.0, 242.0);

	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2(-p.x, -p.y)).rgb);
	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2( p.x, -p.y)).rgb);
	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2(-p.x,  p.y)).rgb);
	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2( p.x,  p.y)).rgb);

	return particle_glow * 1023.0;
}

// TODO: Optimisation
// Ensure each vbuffer that needs to do heavy texture lookups start at an even offset to ensure they land in the same quad group.
void main(){
	outColor = vec4(0.0, 0.0, 0.0, 1.0);

	if (st == FRAME_COUNTER) {
		outColor.rgb = advance_frame();
	}

    if (within(VBUF_COLOR_0)) {
        ivec2 color_st = global_st_to_vbuffer_st(st, VBUF_COLOR_0);
		// We spread source colors over a larger area to ensure they are captured in the downsampled buffers,
		// and to prevent rays missing colors when they sample.
        outColor.rgb = store_color(color_st);
		// outColor.rgb = vec3(1.0, 0.0, 0.0);
		// outColor.rgb = vec3(vec2(color_st) / VBUF_COLOR_0.bounds, 0.0);
    }

    if (within(VBUF_COLOR_1)) {
		// outColor.rgb = vec3(0.0, 1.0, 0.0);
		// return;
        ivec2 color_st = global_st_to_vbuffer_st(st, VBUF_COLOR_1);
        outColor.rgb = sample_buffer_texel(VBUF_COLOR_0, color_st);
    }

	if (within(SDF)) {
		ivec2 sdf_st = global_st_to_vbuffer_st(st, SDF);

		// Bits:
		//   - 0-1: Current material for upper half of screen
		//   - 2-3: Current material for lower half of screen
		//   - 4-5: Previous material for upper half of screen
		//   - 6-7: Previous material for lower half of screen
		uint materialUpper = getMaterial(sdf_st);
		uint materialLower = getMaterial(sdf_st + ivec2(0, GLOW_BOUNDS.y / 2.0));
		uint currentMaterials = materialUpper << 2 | materialLower;

		vec3 previousFrame = texelFetch(BUFFER, st, 0).rgb;
		uint previousMaterials = uint(previousFrame.b * 255.0) >> 4 & 0xF;
		uint combinedMaterials = currentMaterials << 4 | previousMaterials;

		float materials = float(combinedMaterials) / 255.0;


		// Pipeline step 2a
		//   - SDF Second pass (vertical)

		float distUpper = distanceFieldPassVertical(sdf_st + ivec2(0, -1));
		float distLower = distanceFieldPassVertical(sdf_st + ivec2(0, 120));

		outColor.rgb = vec3(
			distUpper,
			distLower,
			materials
		);
	}

	if (within(HDR_VBUF_0)) {
        ivec2 hdr_st = global_st_to_vbuffer_st(st, HDR_VBUF_0);
		ivec2 snap_st = ivec2(hdr_st.x & ~1, hdr_st.y);
		vec2 uv = vbuffer_st_to_vbuffer_uv(snap_st, HDR_VBUF_0);
		vec3 glow = sample_hdr_buffer(uv);
		uint material = sample_sdf(uv * GLOW_BOUNDS).material;

		// === Denoising ===

		// Nearly all of the visible noise is only present in air
		// Denoise only in air, so that sharp shadows can be preserved on terrain
		// if(material == 3u) {
			// Good settings for a static image
			// float sigma = 1.3;
			// float kSigma = 2.7;
			// float threshold = 0.17;

			float sigma = 1.5;
			float kSigma = 3.0;
			float threshold = 2.0;
			vec2 pixel = vec2(1.0) / vec2(107.0, 60.0);
			glow = smartDeNoise(uv, pixel, sigma, kSigma, threshold);
		// }

		// Add vanilla particle glow
		// TODO: This is out of sync with the monte carlo glow. There should be enough free
		// buffer space to delay this.
		glow += downsample_particle_glow(uv);

		uvec3 glow_bits = uvec3(glow * 255.0);
        if ((hdr_st.x & 1) == 0) {
			// High bits
            glow = vec3((glow_bits >> 8) & 0xFFu) / 255.0;
        } else {
			// Low bits
            glow = vec3(glow_bits & 0xFFu) / 255.0;
        }

        outColor.rgb = glow;

		// Skip denoising
		// if((get_frame() & 64) == 64){
			// outClor.rgb = texelFetch(BUFFER, st, 0).rgb;
		// }
    }
}
