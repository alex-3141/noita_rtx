#ifndef INCLUDE_SDF
#define INCLUDE_SDF

#include "material.frag"
#include "vbuffer.frag"

float distanceFieldPassHorizontal(ivec2 st){
	int dist = 255;
	uint startMaterial = sampleMaterial(st);

	// Forwards walk
	int max_x = min(int(GLOW_BOUNDS.x), st.x + 255);

	for(int x = st.x + 1; x <= max_x; x++) {
		uint endMaterial = sampleMaterial(ivec2(x, st.y));
		if (startMaterial != endMaterial) {
			dist = x - st.x;
			break;
		}
	}

	// Backwards walk
	int min_x = max(0, st.x - dist);

	for(int x = st.x - 1; x >= min_x; x--) {
		uint endMaterial = sampleMaterial(ivec2(x, st.y));

		if (startMaterial != endMaterial) {
			dist = min(dist, st.x - x);
			break;
		}
	}

	return float(dist) / 255.0;
}

float emitterDistanceFieldPassHorizontal(ivec2 st){
	int dist = 255;
	float startMaterial = texelFetch(BUFFER, st, 0).r;

	// Forwards walk
	int max_x = min(321, st.x + 255);

	for(int x = st.x + 1; x <= max_x; x++) {
		float endMaterial = texelFetch(BUFFER, ivec2(x, st.y), 0).r;
		if (startMaterial != endMaterial) {
			dist = x - st.x;
			break;
		}
	}

	// Backwards walk
	int min_x = max(214, st.x - dist);

	for(int x = st.x - 1; x >= min_x; x--) {
		float endMaterial = texelFetch(BUFFER, ivec2(x, st.y), 0).r;

		if (startMaterial != endMaterial) {
			dist = min(dist, st.x - x);
			break;
		}
	}

	return float(dist) / 255.0;
}

vec3 build_sdf(ivec2 buf_st, vec3 outColor){
    // SDF Pipeline step 1b

    // First vertical pass
    float distUpper = distanceFieldPassHorizontal(buf_st + ivec2(0, 0));
    float distLower = distanceFieldPassHorizontal(buf_st + ivec2(0, 120));

    return vec3(
        distUpper,
        distLower,
        outColor.b
    );
}

// Finds the distance to the nearest material in the vertical direction
float distanceFieldPassVertical(ivec2 st){
	SDFSample centerSample = sample_sdf_texel(st);
	int centerDist = int(centerSample.dist * 255.0);
	uint centerMaterial = centerSample.material;
	int minDistSqr = centerDist * centerDist;

	// Down walk
	int max_y = min(int(GLOW_BOUNDS.y), st.y + centerDist);

	for(int y = st.y + 1; y <= max_y; y++) {
		SDFSample sdfSample = sample_sdf_texel(ivec2(st.x, y));
		int y_dist = y - st.y;

		if (centerMaterial != sdfSample.material) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.dist * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		// Early exit implicitally handled by max_y
		minDistSqr = min(minDistSqr, dSqr);
	}

	// Up walk
	int min_y = max(0, st.y - minDistSqr);

	for(int y = st.y - 1; y >= min_y; y--) {
		SDFSample sdfSample = sample_sdf_texel(ivec2(st.x, y));
		int y_dist = y - st.y;

		if (centerMaterial != sdfSample.material) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.dist * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		minDistSqr = min(minDistSqr, dSqr);
	}

	float dist = sqrt(float(minDistSqr));

	return dist / 255.0;
}

float emitterDistanceFieldPassVertical(ivec2 st){
	vec3 centerSample = texelFetch(BUFFER, st, 0).rgb;
	int centerDist = int(centerSample.g * 255.0);
	int minDistSqr = centerDist * centerDist;

	// Down walk
	int max_y = min(59, st.y + centerDist);

	for(int y = st.y + 1; y <= max_y; y++) {
		vec3 sdfSample = texelFetch(BUFFER, ivec2(st.x, y), 0).rgb;
		int y_dist = y - st.y;

		if (centerSample.r != sdfSample.r) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.g * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		// Early exit implicitally handled by max_y
		minDistSqr = min(minDistSqr, dSqr);
	}

	// Up walk
	int min_y = max(0, st.y - minDistSqr);

	for(int y = st.y - 1; y >= min_y; y--) {
		vec3 sdfSample = texelFetch(BUFFER, ivec2(st.x, y), 0).rgb;
		int y_dist = y - st.y;

		if (centerSample.r != sdfSample.r) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.g * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		minDistSqr = min(minDistSqr, dSqr);
	}

	float dist = sqrt(float(minDistSqr));

	return dist / 255.0;
}

#endif