// Just enough H.264 / HEVC bitstream reading to tell WebCodecs exactly what a stream is: the
// codec string ("avc1.640033", "hev1.1.6.L153.B0") comes from the keyframe's own parameter sets,
// so the decoder is configured for the profile and level the host really sent.

/** The NAL units of an Annex B buffer, as views without their start codes. */
export function* nalUnits(data) {
    const n = data.length;
    let start = -1;
    let i = 0;
    while (i + 2 < n) {
        if (data[i] === 0 && data[i + 1] === 0 && (data[i + 2] === 1 || (data[i + 2] === 0 && i + 3 < n && data[i + 3] === 1))) {
            if (start >= 0) yield data.subarray(start, i);
            i += data[i + 2] === 1 ? 3 : 4;
            start = i;
        } else {
            i++;
        }
    }
    if (start >= 0 && start < n) yield data.subarray(start, n);
}

/** The first `count` payload bytes of a NAL unit with emulation prevention bytes (00 00 03) removed. */
function rbsp(nal, count) {
    const out = new Uint8Array(count);
    let zeros = 0;
    let at = 0;
    for (let i = 0; i < nal.length && at < count; i++) {
        const b = nal[i];
        if (zeros >= 2 && b === 3) { zeros = 0; continue; }
        zeros = b === 0 ? zeros + 1 : 0;
        out[at++] = b;
    }
    return at === count ? out : null;
}

const hex2 = (b) => (b < 16 ? '0' : '') + b.toString(16);

/** "avc1.PPCCLL" from the SPS in a keyframe, or null. */
export function h264Codec(keyframe) {
    for (const nal of nalUnits(keyframe)) {
        if ((nal[0] & 0x1f) === 7 && nal.length >= 4) return `avc1.${hex2(nal[1])}${hex2(nal[2])}${hex2(nal[3])}`;
    }
    return null;
}

/** "hev1.<profile>.<compatibility>.<tier><level>.<constraints>" from the SPS in a keyframe, or null. */
export function hevcCodec(keyframe) {
    for (const nal of nalUnits(keyframe)) {
        if (((nal[0] >> 1) & 0x3f) !== 33) continue;
        // 2 header bytes, 1 byte of ids, then profile_tier_level: 1 + 4 + 6 + 1 bytes.
        const b = rbsp(nal, 15);
        if (!b) return null;
        const space = ['', 'A', 'B', 'C'][b[3] >> 6];
        const tier = (b[3] >> 5) & 1 ? 'H' : 'L';
        const profile = b[3] & 0x1f;
        let compat = 0;
        const flags = ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0;
        for (let i = 0; i < 32; i++) if (flags & (1 << i)) compat |= 1 << (31 - i);
        let end = 14;
        while (end > 8 && b[end - 1] === 0) end--;
        const constraints = Array.from(b.subarray(8, end), (v) => '.' + v.toString(16).toUpperCase()).join('');
        return `hev1.${space}${profile}.${(compat >>> 0).toString(16).toUpperCase()}.${tier}${b[14]}${constraints}`;
    }
    return null;
}

/** Codec strings to ask `isConfigSupported` about before any stream exists. */
export const PROBE = Object.freeze({
    h264: 'avc1.640033',            // High, level 5.1
    hevc: 'hev1.1.6.L153.B0',       // Main, level 5.1
    hevc444: 'hev1.4.10.L153.9E.8', // Range extensions, 4:4:4 8-bit, level 5.1
});
