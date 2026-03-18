#version 400

#define BUFFER tex_glow_prev_frame

struct VBuffer {
	vec2 pos;
	vec2 bounds;
};

#ifndef SRGB_EPSILON 
#define SRGB_EPSILON 1e-10
#endif

#ifndef FNC_SRGB2RGB
#define FNC_SRGB2RGB
// 1.0 / 12.92 = 0.0773993808
// 1.0 / (1.0 + 0.055) = 0.947867298578199
float srgb2rgb(const in float v) {   return (v < 0.04045) ? v * 0.0773993808 : pow((v + 0.055) * 0.947867298578199, 2.4); }
vec3 srgb2rgb(const in vec3 srgb) {  return vec3(   srgb2rgb(srgb.r + SRGB_EPSILON),
                                                    srgb2rgb(srgb.g + SRGB_EPSILON),
                                                    srgb2rgb(srgb.b + SRGB_EPSILON)); }
vec4 srgb2rgb(const in vec4 srgb) {  return vec4(   srgb2rgb(srgb.rgb), srgb.a); }
#endif


#if !defined(FNC_SATURATE) && !defined(saturate)
#define FNC_SATURATE
#define saturate(V) clamp(V, 0.0, 1.0)
#endif

#ifndef FNC_RGB2SRGB
#define FNC_RGB2SRGB
float rgb2srgb(const in float c) {   return (c < 0.0031308) ? c * 12.92 : 1.055 * pow(c, 0.4166666666666667) - 0.055; }
vec3  rgb2srgb(const in vec3 rgb) {  return saturate(vec3(  rgb2srgb(rgb.r - SRGB_EPSILON), 
                                                            rgb2srgb(rgb.g - SRGB_EPSILON), 
                                                            rgb2srgb(rgb.b - SRGB_EPSILON))); }
vec4  rgb2srgb(const in vec4 rgb) {  return vec4(rgb2srgb(rgb.rgb), rgb.a); }
#endif


#ifndef FNC_LUMINANCE
#define FNC_LUMINANCE
float luminance(in vec3 linear) { return dot(linear, vec3(0.21250175, 0.71537574, 0.07212251)); }
float luminance(in vec4 linear) { return luminance( linear.rgb ); }
#endif



// Virtual buffers
// The texture is split into different zones that are used in place of extra shader passes.
const vec2 GLOW_SIZE = vec2(431.0, 242.0);
const vec2 GLOW_BOUNDS = GLOW_SIZE - vec2(1.0);

const vec2 VBUF_SIZE = vec2(106.0, 60.0);
const vec2 VBUF_SIZE_UV = VBUF_SIZE / GLOW_SIZE;
const vec2 VBUF_BOUNDS = VBUF_SIZE - vec2(1.0);
const vec2 VBUF_BOUNDS_UV = VBUF_BOUNDS / GLOW_BOUNDS;

const float HALF_WIDTH = GLOW_SIZE.x / 2.0;

const vec2 HDR_VBUF_SIZE = vec2(HALF_WIDTH, 60.0);
const vec2 HDR_VBUF_SIZE_UV = HDR_VBUF_SIZE / GLOW_SIZE;
const vec2 HDR_VBUF_BOUNDS = HDR_VBUF_SIZE - vec2(1.0);
const vec2 HDR_VBUF_BOUNDS_UV = HDR_VBUF_BOUNDS / GLOW_BOUNDS;

const float COLOR_VBUF_WIDTH = HALF_WIDTH;
const vec2 COLOR_VBUF_SIZE = vec2(COLOR_VBUF_WIDTH, 60.0);
const vec2 COLOR_VBUF_SIZE_UV = COLOR_VBUF_SIZE / GLOW_SIZE;
const vec2 COLOR_VBUF_BOUNDS = COLOR_VBUF_SIZE - vec2(1.0);
const vec2 COLOR_VBUF_BOUNDS_UV = COLOR_VBUF_BOUNDS / GLOW_BOUNDS;


const VBuffer VBUF_COLOR_0 = VBuffer(vec2(0.0, 0.0), COLOR_VBUF_BOUNDS);
const VBuffer VBUF_COLOR_1 = VBuffer(vec2(0.0, COLOR_VBUF_SIZE.y), COLOR_VBUF_BOUNDS);
const VBuffer HDR_VBUF0 = VBuffer(vec2(HDR_VBUF_SIZE.x, HDR_VBUF_SIZE.y), HDR_VBUF_BOUNDS);
const VBuffer SDF = VBuffer(vec2(0, 120), vec2(430, 121));
const VBuffer EMITTER_SDF = VBuffer(vec2(HALF_WIDTH, 0), vec2(107, 59));


// inputs
uniform sampler2D 	tex_glow_prev_frame;
uniform vec2        one_per_glow_texture_size;
uniform float		time;

out vec4 outColor;

ivec2 st = ivec2(gl_FragCoord.xy);

bool within(VBuffer vbuffer) {
	return st.x >= vbuffer.pos.x &&
		   st.x <= vbuffer.bounds.x + vbuffer.pos.x &&
		   st.y >= vbuffer.pos.y &&
		   st.y <= vbuffer.bounds.y + vbuffer.pos.y;
}

ivec2 global_st_to_vbuffer_st(ivec2 st, VBuffer vbuffer) {
	return st - ivec2(vbuffer.pos);
}

vec2 global_st_to_vbuffer_space_st(ivec2 st, VBuffer vbuffer) {
	return vec2(st - vbuffer.pos) / vbuffer.bounds;
}

vec3 sample_buffer_texel(VBuffer vbuffer, ivec2 st) {
	st += ivec2(vbuffer.pos);
	return texelFetch(tex_glow_prev_frame, st, 0).rgb;
}

vec2 global_st_to_hdr_vbuffer_space_uv(ivec2 st, VBuffer vbuffer) {
    vec2 offset = vec2(st) - vbuffer.pos;
    offset /= vbuffer.bounds;
	return offset;
}

vec2 vbuffer_st_to_vbuffer_uv(ivec2 st, VBuffer vbuffer) {
    return vec2(st) / vbuffer.bounds;
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
	float startMaterial = texelFetch(tex_glow_prev_frame, st, 0).r;

	// Forwards walk
	int max_x = min(321, st.x + 255);

	for(int x = st.x + 1; x <= max_x; x++) {
		float endMaterial = texelFetch(tex_glow_prev_frame, ivec2(x, st.y), 0).r;
		if (startMaterial != endMaterial) {
			dist = x - st.x;
			break;
		}
	}

	// Backwards walk
	int min_x = max(214, st.x - dist);

	for(int x = st.x - 1; x >= min_x; x--) {
		float endMaterial = texelFetch(tex_glow_prev_frame, ivec2(x, st.y), 0).r;

		if (startMaterial != endMaterial) {
			dist = min(dist, st.x - x);
			break;
		}
	}

	return float(dist) / 255.0;
}

// Material types
// Opaque               0
// Liquid				1
// Emissive             2
// Air or Gas           3

float materialOcclusionFactor(uint material){
	if(material == 0u){
		return 0.84; // Opaque
	}
	if(material == 1u){
		return 0.95; // Liquid
	}
	if(material == 2u){
        // Rays stop on emissive surfaces, so this only serves to fill in emissive areas
        // with a solid color
		return 1.0; // Emissive
	}

	return 1.0; // Air or gas
}

#define FRAME_COUNTER ivec2(430, 0)

int get_frame(){
	vec4 t = texelFetch(tex_glow_prev_frame, FRAME_COUNTER, 0);
	int frame = int(t.r * 255.0 + t.g * 255.0 * 256.0 + t.b * 255.0 * 256.0 * 256.0);
	return frame;
}

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

// 
const uint blue_noise_LUT_32x32x3[768] = uint[](
    0x84049EC0u, 0x85FF795Cu, 0xB559A380u, 0xF8AF67CFu, 0xA7D73DA0u, 0x1039EA75u, 0xA81CD4A3u, 0x195D0B77u, 
    0x3FCCE943u, 0x3369C3E4u, 0xFB0CC5E8u, 0x5D00E636u, 0x0BBD2F7Du, 0xCCB42264u, 0xEB8E402Eu, 0xF3A3D849u, 
    0x20735667u, 0x95B60E8Fu, 0x8D206244u, 0xC646769Eu, 0xF9581C90u, 0x785197E0u, 0x6B599DFFu, 0x267C39C8u, 
    0xF4BB169Au, 0xD6542CABu, 0x41DCAE7Cu, 0xDD2512BEu, 0x89A56BEDu, 0x6103C52Au, 0x29DB0EBCu, 0xD1B79106u, 
    0x4ADA3383u, 0x1DF8C862u, 0x6B2FF104u, 0x4DAAF382u, 0xCF3A06B3u, 0xE6A67F49u, 0xF073881Eu, 0xFF1252A0u, 
    0x098CB180u, 0x6E9B3D7Du, 0x0ACB4BA6u, 0x3162D353u, 0x1798D678u, 0x3142F470u, 0x35B146D1u, 0x4560E3BFu, 
    0xA1F06AD6u, 0x5CEA11DFu, 0xB4E489C1u, 0xC28C1E99u, 0xBB50FE0Fu, 0x6AB60ADCu, 0x18F85794u, 0xC6762286u, 
    0x1F3B5A2Bu, 0x248EB872u, 0x2A781638u, 0xEAAF3DF9u, 0xAD258543u, 0xEC1B905Du, 0x66C901A2u, 0x98EDAD4Fu, 
    0x50C3AA14u, 0xD24830CDu, 0x6557A1FEu, 0x1A6F00D7u, 0xE768CA5Bu, 0x7DC33D2Fu, 0x9D79E129u, 0x8B3F07D9u, 
    0xF97BE4BAu, 0x6AE29903u, 0x93C80682u, 0xE07EBD4Fu, 0x9E0491A7u, 0xD452FA73u, 0x43113860u, 0xF77130C4u, 
    0xAF270863u, 0x0EAC6087u, 0xA8F242B5u, 0x2C9AEE21u, 0xD151F739u, 0x0B89B013u, 0x91FDA7B9u, 0x541DB4EAu, 
    0xD66D449Eu, 0x55F5183Du, 0x3371DD2Cu, 0x69CF460Fu, 0x7B22BE0Eu, 0xF12046E1u, 0x2585496Fu, 0xDDCF7E5Au, 
    0xEC94C284u, 0x9178C74Eu, 0xE5891CBEu, 0x8BA55F7Bu, 0x5FB442D7u, 0x9B35C895u, 0xB019CEDCu, 0x34109A69u, 
    0x3013FE22u, 0x38E921B9u, 0xC44862D6u, 0x5503FCB2u, 0x2DE881F0u, 0x5968A601u, 0xC0513107u, 0xACEF3CE0u, 
    0xAA5867CBu, 0x6D01A27Eu, 0x9216A99Bu, 0x1FC93C28u, 0x4E6E12A0u, 0xBCE683F9u, 0x73EC8F79u, 0x485E8B80u, 
    0x0C8FD905u, 0x4FD15FE2u, 0x55EC09FFu, 0x75BA6BDBu, 0xC0AE9435u, 0x28193BD4u, 0xD73FA1FCu, 0x78B6F82Bu, 
    0x733ABCE9u, 0x268C3EF6u, 0x83CB7632u, 0x4BF2AB0Cu, 0x6425CEDFu, 0xB349920Du, 0xAA6112CAu, 0x981CC70Du, 
    0x4A24A850u, 0xB3C51A9Du, 0x603AA1E3u, 0x89182F99u, 0xEC40075Cu, 0x6EDEA276u, 0x97218650u, 0x316D4457u, 
    0xCC83F211u, 0x7F0E66DDu, 0xF51DBD58u, 0x7EE742D6u, 0x8BB3FB9Bu, 0x02F25B2Fu, 0xB9F6D537u, 0xD5A57FE4u, 
    0x2E80638Cu, 0xEE9651AFu, 0x8D47036Eu, 0x67AEBC71u, 0xD95520C3u, 0x9ABE1BC7u, 0x2F6678A9u, 0x5AFDCC05u, 
    0x74E6A0C2u, 0xCE42FBBFu, 0xC9B1DF2Du, 0xD44E8123u, 0x4811792Cu, 0x294381ABu, 0x4CC30EECu, 0x263B1990u, 
    0x911845DBu, 0x86210936u, 0x0F549C62u, 0x87389FFCu, 0x6CEAA3F4u, 0x8C65FE08u, 0xA63DE259u, 0x7BB270EEu, 
    0xA96BF853u, 0xABB7D85Cu, 0x327AF112u, 0x0BE0596Bu, 0xB5933D61u, 0x14DD37D0u, 0x821E94CCu, 0x08955ED5u, 
    0xCD3D22B9u, 0xE54E79EBu, 0x94D1BE3Eu, 0xB0BF19EAu, 0x58E317C9u, 0xB07C9F24u, 0x00B67146u, 0xCAF42A4Fu, 
    0x03A47D9Cu, 0x92162C8Au, 0x48092870u, 0x7229A482u, 0x742E4B8Fu, 0xED4D04C2u, 0x66FC31C0u, 0x3411ACE4u, 
    0x56F014E1u, 0xC9FE69C3u, 0xB5F6AD5Du, 0xE840D963u, 0xDB85F902u, 0x266AF398u, 0x3AD19C0Du, 0x6E44C489u, 
    0x26D26288u, 0x499BB143u, 0x1C3AE080u, 0x56990CC7u, 0x43B865CEu, 0x84A85F1Bu, 0xA4175BE6u, 0x52D97924u, 
    0x8FA73BFCu, 0xD7350CE7u, 0x8C75A287u, 0x7C32FD4Cu, 0x0FAC22A3u, 0xD78E34CFu, 0x4B92773Fu, 0x9904BCEFu, 
    0x7508B82Eu, 0x227DC05Eu, 0xD32E55EBu, 0x11B96BA7u, 0xE74E38F0u, 0xBC52FD7Bu, 0x6CF6CA09u, 0x1FAD5F0Fu, 
    0xDC50C87Eu, 0xB66CF11Cu, 0x05BF6410u, 0x895B20EDu, 0x69C793DEu, 0xAF2B029Cu, 0xB533AB1Fu, 0xEBCE40DBu, 
    0x96F76810u, 0xCD3B9F47u, 0x9B3FF591u, 0x42C2E17Fu, 0xB5280772u, 0x6FDCC45Au, 0x8656E54Au, 0x4E719425u, 
    0x29B2368Au, 0x50AE14D5u, 0x1873DA28u, 0x15952B4Du, 0x86F252D0u, 0xF3914518u, 0xC2016581u, 0xE0AA31FAu,
    0xC490AF04u, 0x652D501Bu, 0x974DC60Cu, 0x8D4B307Cu, 0xFA5EB102u, 0xA7618F0Au, 0x1B9A270Du, 0xFFB5ABC5u, 
    0xEF263DD4u, 0xDFC0029Bu, 0x3C6C26A8u, 0xF5A418EEu, 0xD4876EBDu, 0x442F7920u, 0x4FBA6FEAu, 0x7E4309F0u, 
    0x83E014BDu, 0x3871AA41u, 0x05D0FF8Cu, 0x3667DEB4u, 0x9F2DE252u, 0xC297DE50u, 0x11AEDB82u, 0x9BE76884u, 
    0x57A6754Au, 0x10D3F863u, 0x92177A48u, 0x0DCE8659u, 0x3FC51B98u, 0x01F769B4u, 0x923C5E1Eu, 0x5E1E36D2u, 
    0xC908ED2Bu, 0xB9941D31u, 0xBCE49F5Fu, 0x78A0294Au, 0x067DFF44u, 0xA23816EDu, 0x29FC4BCDu, 0x8FC8A6E3u, 
    0x8AB36CD8u, 0xF14C76E6u, 0x7133D723u, 0xB8F11DEAu, 0x5EAD6ADAu, 0xB75785CAu, 0xC0096A8Du, 0xFA025672u, 
    0x125139A2u, 0xAD04BF9Du, 0xA8074184u, 0x023B63C8u, 0x338E2157u, 0x2B72E39Cu, 0x9B7DDCEFu, 0x7D15B742u, 
    0xD3F61CBEu, 0x56DC2A3Eu, 0x8FFB68CBu, 0x94A5820Fu, 0x0BE9D2C1u, 0x44D6244Fu, 0x1A35AC14u, 0x47638BF4u, 
    0x806693CCu, 0x916EEF5Du, 0x462BB81Au, 0x72F7DE59u, 0x76B2412Cu, 0x05A8BEF9u, 0xCB5160C6u, 0x30E8D926u, 
    0xA4E22778u, 0x370BB288u, 0xD49B7BE6u, 0x501737BEu, 0x4A8A12E5u, 0x8167931Bu, 0xB1E490FFu, 0x9F0AA66Bu, 
    0x46B9824Du, 0xF651CF1Fu, 0xF3145EA4u, 0xCDAB2374u, 0x9EEF697Fu, 0xA33B5AD0u, 0x0174472Du, 0xFF5B3C85u, 
    0x33EB6FD2u, 0x289676C3u, 0x88004BC1u, 0x069664B2u, 0x00C638BAu, 0x0EE0F333u, 0xD516EBC1u, 0x1197C24Fu, 
    0x5A0DA636u, 0x43D817FCu, 0x32CCE170u, 0xFCD642E7u, 0x255EA153u, 0x527C6EB7u, 0x32B89A24u, 0xB6E122F7u, 
    0x9ADC8D62u, 0xB006647Fu, 0xA6671D8Cu, 0x2D7A0C53u, 0x8491E01Cu, 0xCCB017D5u, 0xA75C6988u, 0x196D7A90u, 
    0x4E24F13Eu, 0x36E4AABCu, 0x269CBAF9u, 0xB38EC4F1u, 0xA9F67346u, 0x0440EB4Fu, 0xCE3EF4DDu, 0xC549ED07u, 
    0xCC057BD6u, 0x54862A41u, 0xDA3E7910u, 0xEB601585u, 0x083B11CAu, 0xA598652Au, 0x147F1D30u, 0xAF29A055u, 
    0xF5AC5796u, 0xC7EB6A15u, 0x4F04D35Du, 0x55983470u, 0xDBBC6BA6u, 0x59FFC57Bu, 0xDAB1C275u, 0x0BE48965u, 
    0x8C732D67u, 0x2097B2D6u, 0xB390F2A2u, 0x01DFBEFEu, 0x9EE78722u, 0x0C8E1D4Cu, 0xFB944EE4u, 0xF841BB35u, 
    0x47C11CB5u, 0x4C758033u, 0x1E632EBFu, 0xD32AA249u, 0x305C44F8u, 0x6C38B5D2u, 0x002843ACu, 0x8513CA72u, 
    0xA1EDDFD0u, 0x3CDDFD61u, 0xCAE3830Eu, 0x3A697D0Au, 0x9513A478u, 0xCB83F503u, 0x8BD3F012u, 0x4CA32159u, 
    0x13513904u, 0x8EB72781u, 0x41A96EEEu, 0x8E5BED95u, 0x68EFC6B8u, 0x5DDC2776u, 0x9F66B898u, 0x6279D8E8u, 
    0xB06D8D9Au, 0xC8589ACEu, 0xD935511Bu, 0x1CD0B113u, 0xE1344D07u, 0x3FBD52A9u, 0x0B7F311Eu, 0xFC2DB047u, 
    0x08E525C8u, 0x066845F1u, 0x77FB93A5u, 0xFA5227BDu, 0x8E20ADD9u, 0xE9099F42u, 0xC354FA73u, 0xA718EE39u, 
    0x75BB5C7Fu, 0x79E21F34u, 0x015D2BD1u, 0x9A328667u, 0xCF618271u, 0x8CC619FCu, 0xDF15CEAFu, 0x456ABA92u, 
    0xD840F30Eu, 0xF5B988ACu, 0x9EE4AA48u, 0x45A6F3C9u, 0x00BAE90Du, 0x2B5F7E6Fu, 0x27A4684Bu, 0xD5560375u, 
    0x531A9230u, 0x37600D9Du, 0x4D208412u, 0x5DDF1639u, 0x563C2CC4u, 0x9BF136DEu, 0x5C8606E6u, 0xE38AA0F6u, 
    0xCC67B3ABu, 0x99C52EFDu, 0xEFC070DCu, 0x23B77A91u, 0x95A3F78Au, 0x10BB1EAFu, 0x32C0D940u, 0xC23B1DD1u, 
    0x48007825u, 0x56EC6E81u, 0xD00D3EB1u, 0xD2680758u, 0xCA13774Eu, 0x75D38745u, 0xEA49B292u, 0xFA71517Fu, 
    0xBEE93ED4u, 0x90051EDFu, 0xA363FA25u, 0xAE96E82Eu, 0x0562E61Au, 0x315567F5u, 0x176C23FDu, 0x610ABBA9u, 
    0x2AA38515u, 0x47AE5E96u, 0x808ABBD7u, 0x41FDBA48u, 0xC191D734u, 0x089DE329u, 0x80A45AC7u, 0x9E47EE93u, 
    0x0E4CF2C7u, 0x7ACE39B6u, 0xE0733416u, 0x720F8421u, 0xA27E57AAu, 0xB51A713Au, 0x3FE08A7Cu, 0x8DDE2DCFu, 
    0xD9685A32u, 0xE988F974u, 0xADF35A9Eu, 0xC9DA61C4u, 0x4715EC27u, 0x4DF0CDB9u, 0x64F737D5u, 0x6F20577Au,
    0x39DB0572u, 0xCA96EBB6u, 0x3AC34DB3u, 0x2686EF08u, 0x01365FD2u, 0xE8C22CCEu, 0xE5AC65B5u, 0x86115F39u, 
    0x7C9263A5u, 0x5F297449u, 0x7BDB8935u, 0x42B66496u, 0x9C4EE50Au, 0x9454ABDFu, 0x7A00CD72u, 0x4ECE8FA0u, 
    0xCB15E62Bu, 0xE116C0F7u, 0xF86901ADu, 0x9AC61949u, 0x1FB176F6u, 0x0CF41465u, 0xC31B4A34u, 0xBE0AF22Fu, 
    0x3353B1FFu, 0x81519D09u, 0xBBA521F2u, 0x557EEA2Cu, 0xEE30BD15u, 0xD3773E83u, 0xD998F18Au, 0x3C6DAE59u, 
    0x6BA084D5u, 0x6D3B8AD9u, 0x0D5741D1u, 0xDA3A9ECFu, 0x5ACB8D6Au, 0x28B0C495u, 0x6940B95Fu, 0x1B7CE223u, 
    0xF045005Eu, 0x0FEAB31Eu, 0xE48898C1u, 0xAA045D74u, 0xDB074B23u, 0xA0FF4810u, 0xA47FE708u, 0x97B74B04u, 
    0xBA77C926u, 0x4CA3602Eu, 0x3764FD26u, 0x87F9B41Fu, 0xA8F7A1E6u, 0xD81E6E34u, 0xFA143050u, 0x41EF8CCDu, 
    0x5594F7A2u, 0xDD038ED0u, 0xC611B677u, 0x2E45D592u, 0x7A613F71u, 0x6685EBBBu, 0xBD709CC8u, 0xDB123256u, 
    0xE20B366Eu, 0x35F07116u, 0xEDAB5484u, 0xBF137B4Bu, 0x2A1990CDu, 0xB6805799u, 0x27DE428Du, 0xC16479A7u, 
    0x3EA9871Fu, 0xC7A949C0u, 0x062CD419u, 0x5AE266A2u, 0xD3EEB002u, 0x37E246C3u, 0x945DD016u, 0x52B0E30Du, 
    0x7D63ECD2u, 0x649623FCu, 0x3B6FE643u, 0x9E288BF5u, 0x0A543AFBu, 0xADF32487u, 0xEC1DF975u, 0x02FE833Cu, 
    0x9F2AB446u, 0xF40FD658u, 0xB2C19C89u, 0xB81ADA55u, 0xDD776881u, 0x975B6DA3u, 0x68B45481u, 0x912C4CC5u, 
    0x07E013C7u, 0xBB306C8Cu, 0x7E215C00u, 0x3144C510u, 0xB71FE998u, 0xBFD41438u, 0xA18A337Eu, 0x709BD808u, 
    0xCF7638F6u, 0x77A7E83Du, 0x32FDD84Fu, 0xD2F27296u, 0xC9480E5Bu, 0x2742F990u, 0x23DDC9E9u, 0x5D1BBA77u, 
    0xAFBF5289u, 0xC5984B1Bu, 0xCBAB3F15u, 0x8705A760u, 0xE12AAEBFu, 0x9D66057Bu, 0x4461184Cu, 0xAAE736F4u, 
    0x93EE21A1u, 0xE128FA5Eu, 0x0B6CEE84u, 0x5025EA49u, 0x619FFE6Du, 0xB7E5AC55u, 0x8FACFD72u, 0x0B6C4FCDu, 
    0x0169452Fu, 0x650FCA82u, 0xB88F20B2u, 0xD83C8BDEu, 0x0A833515u, 0x3A8B1ED0u, 0x2D028510u, 0xDD8213B2u, 
    0xDBB6D1FEu, 0x9F477335u, 0x2FD0523Au, 0xB3A07A18u, 0x4197EFC4u, 0xD82FF6BCu, 0x53DFC158u, 0x5BC695F0u, 
    0x5418997Au, 0xD8BCF59Cu, 0xA4FA7803u, 0x0265F458u, 0xE3227453u, 0xC7764E6Au, 0x78A16499u, 0x06B9371Fu, 
    0xE9883D25u, 0x922FA80Cu, 0x0961C0E5u, 0xE89536C7u, 0x10B0CD45u, 0x1A05A590u, 0xE83F28F4u, 0xAB4D66D3u, 
    0xC360CC6Fu, 0x1A5B6C24u, 0x703F2984u, 0x19BD23E2u, 0xDA602D88u, 0xB382EB34u, 0xAE097048u, 0xE1F68B17u, 
    0x46AEF212u, 0x4AECD27Eu, 0x89ACF1B4u, 0xD67D4A9Cu, 0x409AF8A8u, 0xD12158BAu, 0xCBBD8DE1u, 0x319D447Cu, 
    0xDC039356u, 0x73078E34u, 0xDA510FCAu, 0x596AFB13u, 0x80C46F0Cu, 0x9D63F97Au, 0x2EFB5339u, 0xBDD5015Cu, 
    0x1D74B540u, 0x3CA9FD9Eu, 0xBB216599u, 0x3B93B131u, 0x174CEE27u, 0x0A2CC98Eu, 0x966B12A8u, 0x831FA6EFu, 
    0x67E82BFBu, 0x2B5FBF4Du, 0xD17BF7DEu, 0xE7CB0844u, 0xDFA583B7u, 0x75E7AE53u, 0xB723DA87u, 0x62E2744Du, 
    0xCD86C497u, 0x8715E30Cu, 0x9F5803B8u, 0x197762ECu, 0x39CF6499u, 0xF3436C1Du, 0xE53DC659u, 0x09C1370Fu, 
    0x5B381647u, 0xD3437CA4u, 0x8B6D3795u, 0xDD53AD29u, 0xFE2D0645u, 0xB403BE97u, 0xAD7C1893u, 0x6DA0D28Au, 
    0xB2F3DAA8u, 0x2070ED28u, 0x17C8E750u, 0x23C281FEu, 0x5C79BAF2u, 0x2435D788u, 0x60FE4AD0u, 0x22F5562Au, 
    0x008D7754u, 0xF5C1994Au, 0x40AF0AA5u, 0x8D3780D7u, 0xA7E89D6Du, 0x62E54F0Eu, 0xBC0B6FA9u, 0xCC8202E9u, 
    0x6ABB10E5u, 0x631333CFu, 0xB9542E7Fu, 0xD54C9766u, 0x273E1758u, 0x81F474C8u, 0x93DE329Cu, 0x30669D40u, 
    0xFC5C3E95u, 0x41A9DE85u, 0x76ED8FD4u, 0xF8AA1CE3u, 0x4ADCBF0Du, 0x07A21AB4u, 0xC61447D4u, 0xAF1AB874u, 
    0xA125C5F0u, 0x6F06571Cu, 0xA12411FBu, 0x7032CB5Au, 0xFB7D90A5u, 0x5B3C8B6Bu, 0x5388F822u, 0x46D7FA24u
);
// --- End Generated Packed GLSL Array for Image ---

float getBlueNoise(int frame, ivec2 st) {
	uint frame_index = frame % 3;
    frame_index = 0u;
	uint noise_index = uint((st.x % 32) + (st.y % 32) * 32 + frame_index * 32 * 32);
	uint array_index = noise_index / 4;
	uint pack_index = noise_index % 4;

	return float( (blue_noise_LUT_32x32x3[array_index] >> (pack_index * 8)) & 0xFF ) / 255.0;
}

struct SDFSample {
	float dist;
	uint material;
};

SDFSample sample_sdf(vec2 uv) {
    ivec2 pos = ivec2(uv * GLOW_BOUNDS);
    ivec2 offset = ivec2(0, 0);

	if(pos.y < 121.0){
        offset = ivec2(0, 121);
	}

	vec3 s_texel = texelFetch(tex_glow_prev_frame, pos + offset, 0).rgb;

    float dist;
    int material = 3;

    if(pos.y < 121.0){
        material = (int(s_texel.b * 255.0) >> 2) & 0x3;
        dist = s_texel.r;
    } else {
        material = int(s_texel.b * 255.0) & 0x3;
        dist = s_texel.g;
    }

    return SDFSample(dist, material);
}

vec3 sample_buffer(VBuffer vbuffer, vec2 uv) {
	uv *= vbuffer.bounds / GLOW_BOUNDS;
	uv += vbuffer.pos / GLOW_SIZE;
    return texture2D(tex_glow_prev_frame, uv).rgb;
}

vec3 sample_emitter_color_texel(ivec2 st){
    ivec2 color_st = st;

    color_st /= 2;

    // Clamp to ensure we sample a color at the edges
    color_st = clamp(color_st, ivec2(0, 0), ivec2(214, 119));

    bool top = color_st.y > int(59);

    if(top){
        color_st.y -= int(60);
    }

	uvec3 smp = uvec3(sample_buffer_texel(VBUF_COLOR_1, color_st) * 255.0) & 0xFF;

    uvec3 color_u = uvec3(0);

    if(top){
        color_u = uvec3(
            smp.g,
            smp.b >> 4,
            smp.b
        );
    } else {
        color_u = uvec3(
            smp.r >> 4,
            smp.r,
            smp.g >> 4
        );
    }

    color_u = color_u & 0xF;

    vec3 color = vec3(color_u << 4) / 255.0;

	if (color == vec3(0.0)) {
        // Blast an extremely bright magenta color to make color lookup misses obvious during debugging
		// return vec3(10.0, 0.0, 10.0);

		return vec3(0.0, 0.0, 0.0);
	}

    return color;
}

vec3 sample_emitter_color(vec2 uv) {
    ivec2 emitter_st = ivec2(uv * GLOW_BOUNDS);
	vec3 smp = sample_emitter_color_texel(emitter_st);
	return smp;
}

#define LIGHT_BLEED

vec3 castRays(vec2 uv){
	const float rays = 128.0;
	const uint steps = 24u;

    // TODO: Optimisation

	int frame = get_frame();
	// frame = 4;
	float noise = getBlueNoise(frame, ivec2(uv * GLOW_BOUNDS));
	// noise = 0.0;
	vec3 color = vec3(0.0);

	vec2 start_pos = vec2(uv * GLOW_BOUNDS);
    // start_pos += 2.0;

	SDFSample startSample = sample_sdf(uv);

	for(float ray_index = 0.0; ray_index < rays; ray_index++){
		float angle = (ray_index / rays + noise) * 6.28318530718;
		vec2 dir = vec2(cos(angle), sin(angle));

		float rayIntensity = 1.0;
		float dt = 0.0;
		// vec2 pos = start_pos;
		vec2 pos = start_pos;

		// vec2 pos = vec2(st) + dir * startSample.dist * 255.0;
        pos += dir * 2.0;

        // Ray starting off-screen
        if(pos.x < 0.0 || pos.x > GLOW_BOUNDS.x || pos.y < 0.0 || pos.y > GLOW_BOUNDS.y){
            break;
        }

		for(uint step_index = 0; step_index < steps; step_index++){

			// TODO: A better way to convert coordiante spaces
			SDFSample sdfSample = sample_sdf(pos / GLOW_BOUNDS);

			float dist = sdfSample.dist * 255.0;

			// Check if emissive
            // Check that at least 1 step is taken to prevent fireflies
			if(sdfSample.material == 2u && step_index > 1u){
			// if(sdfSample.material == 2u){
			// if(sdfSample.material == 2u){
                vec3 emitter_color = sample_emitter_color(pos / GLOW_BOUNDS);
				vec3 color_linear = srgb2rgb(emitter_color);

				// Stop on surfaces
				// TODO: Add in a screen edge factor to smooth over pop-in
				color += color_linear * rayIntensity;
				break;
			}

			float occlusionFactor = materialOcclusionFactor(sdfSample.material);
			rayIntensity *= pow(occlusionFactor, dist);

			if(rayIntensity < 0.005){
                // TODO: Skip rays that are masked by this pixel, eg.
                // float half_arc_length = asin(0.5 / dist);
                // ray_index += int(rays * half_arc_length);
				break;
			}

			dt += max(0.707, dist);

			pos = start_pos + dir * dt;

            // Ray off-screen
			if(pos.x < 0.0 || pos.x > GLOW_BOUNDS.x || pos.y < 0.0 || pos.y > GLOW_BOUNDS.y){
				break;
			}

		}
	}

	return color / rays;
}


vec3 monteCarlo(vec2 uv){
	// Glow monte carlo

	vec3 color = castRays(uv);

    // Expand into 16 bit range
    color *= 255.0;

	return color;
}

vec3 build_sdf(ivec2 buf_st){
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

float sample_emitter_sdf(vec2 uv) {
	return texelFetch(tex_glow_prev_frame, ivec2(uv * vec2(107, 59)) + ivec2(215, 0), 0).b;
}

void main()
{
	outColor = vec4(0.0, 0.0, 0.0, 1.0);
	outColor.rgb = texelFetch(tex_glow_prev_frame, st, 0).rgb;

    // Copy
	if (within(VBUF_COLOR_0)) {
        outColor.rgb = texelFetch(tex_glow_prev_frame, st, 0).rgb;
    }

    // Copy
	if (within(VBUF_COLOR_1)) {
        outColor.rgb = texelFetch(tex_glow_prev_frame, st, 0).rgb;
    }

	if (within(HDR_VBUF0)) {
        ivec2 hdr_st = global_st_to_vbuffer_st(st, HDR_VBUF0);
		ivec2 snap_st = ivec2(hdr_st.x & ~1, hdr_st.y);
		vec2 uv = vbuffer_st_to_vbuffer_uv(snap_st, HDR_VBUF0);

        // TODO: Test how much of a performance hit doubling this up does
		vec3 glow = monteCarlo(uv);

        // TODO: adding a multiplier based on distance may help reduce fireflies and aliasing

		// float dist = sample_emitter_sdf(uv);

        // if(dist == 1.0/255.0) {
        //     glow *= 0.1;
        // }
        // if(dist == 2.0/255.0) {
        //     glow *= 0.5;
        // }
        // if(dist == 3.0/255.0) {
        //     glow *= 0.5;
        // }

		uvec3 glow_bits = uvec3(glow * 255.0);
        if ((hdr_st.x & 1) == 0) {
			// High bits
            glow = vec3((glow_bits >> 8) & 0xFFu) / 255.0;
        } else {
			// Low bits
            glow = vec3(glow_bits & 0xFFu) / 255.0;
        }

        outColor.rgb = glow;
	}


	if (within(SDF)) {
		ivec2 buf_st = global_st_to_vbuffer_st(st, SDF);
        outColor.rgb = build_sdf(buf_st);
	}

    if (within(EMITTER_SDF)) {
		vec3 prev_frame = texelFetch(tex_glow_prev_frame, st, 0).rgb;

        float dist = emitterDistanceFieldPassHorizontal(st);

        outColor.rgb = vec3(
            prev_frame.r,
            dist,
            prev_frame.b
        );
    }
}
