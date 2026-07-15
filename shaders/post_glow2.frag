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
	return mat_here;
}

vec3 sample_glow_source_st(ivec2 st){
	ivec2 st_clamped = clamp(st, ivec2(0), ivec2(GLOW_BOUNDS));
	vec4 s = texelFetch(tex_glow_source, st_clamped, 0);

	// Disregard non-emissive particles. This also filters out undesired colors
	if(getMaterialType(s) != 2u) {
		return vec3(0.0);
	}

	return s.rgb * 4.0;
}

vec3 sample_glow_source_sum(ivec2 st){
	vec3 sum = vec3(0.0);

	// This would ideally be a direct 4x downscale, but the color buffers are slightly
	// smaller than 1/4 the size of the glow source texture so we have to scan a 5x5 area
	// to make sure nothing is missed

	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 0,  0))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 1,  0))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 2,  0))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 3,  0))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 0,  1))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 1,  1))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 2,  1))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 3,  1))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 0,  2))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 1,  2))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 2,  2))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 3,  2))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 0,  3))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 1,  3))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 2,  3))));
	sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 3,  3))));

	// Edge case, as source glow texture is 2 pixels taller than the 1/4 scaled
	// buffer we're filling
	if(st.y == 59){
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 0,  4))));
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 1,  4))));
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 2,  4))));
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 3,  4))));
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 0,  5))));
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 1,  5))));
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 2,  5))));
		sum = max(sum, srgb2rgb(sample_glow_source_st(st * 4 + ivec2( 3,  5))));
	}

	return rgb2srgb(sum);
	// return rgb2srgb(sum / 16.0);
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

vec3 downsample_particle_glow(vec2 uv){
	vec2 particle_uv = vec2(uv.x, 1.0 - uv.y);
	vec3 particle_glow = vec3(0.0);
	vec2 p = 1.0 / vec2(430.0, 242.0);

	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2(-p.x, -p.y)).rgb);
	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2( p.x, -p.y)).rgb);
	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2(-p.x,  p.y)).rgb);
	particle_glow += srgb2rgb(texture2D(tex_glow_source_particles, particle_uv + vec2( p.x,  p.y)).rgb);

	return particle_glow / 4.0;
}

vec3 sample_color_0(ivec2 st){
	ivec2 clamped_st = clamp(st, ivec2(0), ivec2(107, 59));
	return texelFetch(BUFFER, clamped_st, 0).rgb;
}

vec3 expand_glow_source_color(vec2 uv){
	ivec2 st = ivec2(round(uv * (VBUF_COLOR_1.size - vec2(1.0))));
	vec3 s = vec3(0.0);

	s = max(s, srgb2rgb(sample_color_0(st + ivec2(-1, -1))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2( 0, -1))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2( 1, -1))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2(-1,  0))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2( 0,  0))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2( 1,  0))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2(-1,  1))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2( 0,  1))));
	s = max(s, srgb2rgb(sample_color_0(st + ivec2( 1,  1))));

	return rgb2srgb(s);
}

// TODO: Optimisation
// Ensure each vbuffer that needs to do heavy texture lookups start at an even offset to ensure they land in the same quad group.
void main(){
	outColor = vec4(0.0, 0.0, 0.0, 1.0);

	if (st == FRAME_COUNTER) {
		outColor.rgb = advance_frame();
	}

    if (within(VBUF_COLOR_0)) {
		// ivec2 st = global_st_to_vbuffer_st(st, VBUF_COLOR_0);
		// vec2 uv = global_st_to_vbuffer_uv(st, VBUF_COLOR_0);

		// vec2 vbuf_st = vec2(st) - VBUF_COLOR_0.pos;
		// vec2 uv = vec2(st) / (VBUF_COLOR_0.size - vec2(1.0));

		outColor.rgb = sample_glow_source_sum(st);
    }

    if (within(VBUF_COLOR_1)) {
        // ivec2 st = global_st_to_vbuffer_st(st, VBUF_COLOR_1);
        // outColor.rgb = sample_buffer_texel(VBUF_COLOR_0, st);
		vec2 uv = global_st_to_vbuffer_uv(st, VBUF_COLOR_1);
        outColor.rgb = expand_glow_source_color(uv);
    }

    if (within(VBUF_PARTICLE_0)) {
		vec2 uv = global_st_to_vbuffer_uv(st, VBUF_PARTICLE_0);
		outColor.rgb = vec3(uv, 0.0);
    }

    if (within(VBUF_PARTICLE_1)) {
		vec2 uv = global_st_to_vbuffer_uv(st, VBUF_PARTICLE_1);
		outColor.rgb = vec3(uv, 0.0);
    }

    if (within(VBUF_NORMAL_0)) {
		vec2 uv = global_st_to_vbuffer_uv(st, VBUF_NORMAL_0);
		outColor.rgb = vec3(uv, 0.0);
    }

    if (within(VBUF_NORMAL_1)) {
		vec2 uv = global_st_to_vbuffer_uv(st, VBUF_NORMAL_1);
		outColor.rgb = vec3(uv, 0.0);
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

		float distUpper = distanceFieldPassVertical(sdf_st + ivec2(0, 0));
		float distLower = distanceFieldPassVertical(sdf_st + ivec2(0, 121));

		outColor.rgb = vec3(
			distUpper,
			distLower,
			materials
		);
	}

	if (within(VBUF_HDR)) {
        // outColor.rgb = texelFetch(BUFFER, st, 0).rgb;
		// return;

        ivec2 hdr_st = global_st_to_vbuffer_st(st, VBUF_HDR);
		ivec2 snap_st = ivec2(hdr_st.x & ~1, hdr_st.y);
		vec2 uv = vbuffer_st_to_vbuffer_uv(snap_st, VBUF_HDR);

		// === Denoising ===

		float sigma = 1.5;
		float kSigma = 3.0;
		float threshold = 2.0;
		vec2 pixel = vec2(1.0) / vec2(107.0, 60.0);
		vec3 glow = smartDeNoise(uv, pixel, sigma, kSigma, threshold);

		// Add vanilla particle glow
		// TODO: This is out of sync with the monte carlo glow. There should be enough free
		// buffer space to delay this.
		glow += downsample_particle_glow(uv) * 255.0;

		uvec3 glow_bits = uvec3(glow * 255.0);
		glow_bits = min(glow_bits, 0xFFFFu);

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
		// outColor.rgb = texelFetch(BUFFER, st + ivec2(0, 0), 0).rgb;
		// }
    }
}
