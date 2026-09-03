// Vendor presets: real products offered in the Part number field of a generic
// part. Picking one fills the part number and, when they are blank, the rail
// and a one-line spec note. Palette kinds stay generic; vendors are data.
// Figures are the vendors' own published numbers (D-Robotics and Horizon
// product pages, September 2026).
export const PRESETS = {
  aisbc: [
    { name: 'D-Robotics RDK X5', sublabel: 'RDK X5', rail: '5V',
      notes: 'D-Robotics RDK X5: 8x Cortex-A55 @1.5GHz, 10 TOPS BPU, 4/8GB LPDDR4; 2x 4-lane MIPI CSI, 4x USB 3.0, GbE with PoE, Wi-Fi 6 / BT 5.4, 1x CAN FD, 40-pin header (28 GPIO), HDMI + MIPI DSI; 5V/5A.' },
    { name: 'D-Robotics RDK X3', sublabel: 'RDK X3', rail: '5V',
      notes: 'D-Robotics RDK X3: 4x Cortex-A53 @1.5GHz, dual-core Bernoulli BPU 5 TOPS, 2/4GB LPDDR4; 2x 2-lane MIPI CSI, USB 3.0 + 2x USB 2.0, RJ45, Wi-Fi / BT 4.2, 40-pin header, HDMI 1.4; 5V/3A. Raspberry Pi 4B / CM4 compatible.' },
    { name: 'D-Robotics RDK X3 Module', sublabel: 'RDK X3 Module', rail: '5V',
      notes: 'D-Robotics RDK X3 Module: CM4-form-factor module of the RDK X3 (Sunrise 3, 5 TOPS BPU) for custom carrier boards.' },
    { name: 'D-Robotics RDK S100', sublabel: 'RDK S100', rail: '12V',
      notes: 'D-Robotics RDK S100: 6x Cortex-A78AE @1.5GHz + 4x Cortex-R52+ real-time cores, BPU Nash 80 TOPS, 12GB LPDDR5, 64GB eMMC; GMSL and MIPI camera headers, 4x USB 3.0, 2x GbE, M.2 Key M + Key E (PCIe 3.0), HDMI 1.4; 12-20V DC.' },
    { name: 'D-Robotics RDK S100P', sublabel: 'RDK S100P', rail: '12V',
      notes: 'D-Robotics RDK S100P: 6x Cortex-A78AE @2.0GHz + 4x Cortex-R52+, BPU Nash 128 TOPS, 24GB LPDDR5, 64GB eMMC; same I/O as the RDK S100; 12-20V DC.' },
    { name: 'Raspberry Pi 5', sublabel: 'Raspberry Pi 5', rail: '5V',
      notes: 'Raspberry Pi 5: BCM2712; 2x MIPI CSI/DSI, GbE, USB 3, 40-pin header.' },
    { name: 'NVIDIA Jetson Orin Nano', sublabel: 'Jetson Orin Nano', rail: '5V',
      notes: 'NVIDIA Jetson Orin Nano: up to 40 TOPS; 2x MIPI CSI, GbE, USB 3, 40-pin header.' },
  ],
  autosoc: [
    { name: 'Horizon Journey 6P', sublabel: 'Journey 6P', rail: '',
      notes: 'Horizon Journey 6P: 560 TOPS (effective, 1/2 sparsity), 410K CPU DMIPS, BPU Nash; flagship for full-scenario assisted driving (Horizon SuperDrive). ASIL-B(D) compute, ASIL-D MCU.' },
    { name: 'Horizon Journey 6M', sublabel: 'Journey 6M', rail: '',
      notes: 'Horizon Journey 6M: 80 TOPS (6E/M tier), 100K CPU DMIPS, BPU Nash; highway NOA and urban commute NOA, passive-cooled domain controllers.' },
    { name: 'Horizon Journey 6E', sublabel: 'Journey 6E', rail: '',
      notes: 'Horizon Journey 6E: 80 TOPS (6E/M tier), 100K CPU DMIPS, BPU Nash; highway NOA and urban commute NOA with a lean sensor set.' },
    { name: 'Horizon Journey 6B', sublabel: 'Journey 6B', rail: '',
      notes: 'Horizon Journey 6B: 10+ TOPS, 20K+ CPU DMIPS, BPU Nash; entry-level all-in-one ADAS active safety, driver monitoring, or parking (Horizon Mono 6).' },
    { name: 'Horizon Journey 5', sublabel: 'Journey 5', rail: '',
      notes: 'Horizon Journey 5: 128 TOPS, BPU Bayes; up to 16 HD cameras with multiple 4K streams; urban assisted driving with perception fusion, prediction, and planning.' },
    { name: 'Horizon Journey 3', sublabel: 'Journey 3', rail: '',
      notes: 'Horizon Journey 3: 5 TOPS, BPU Bernoulli, 2.5W; up to 6 HD cameras and a single 4K stream; 8MP front-view NOA and driving-plus-parking controllers (Horizon Mono 3).' },
    { name: 'Horizon Journey 2', sublabel: 'Journey 2', rail: '',
      notes: 'Horizon Journey 2: 4 TOPS, BPU Bernoulli, 2W; 2 HD cameras; front-view L2 ADAS and active safety (Horizon Mono 2).' },
  ],
  adas: [
    { name: 'Horizon Mono 2', sublabel: 'Mono 2', rail: '12V',
      notes: 'Horizon Mono 2 on Journey 2: single 1.7/2.6MP front camera @100/120 deg; FCW, LDW, AEB, BSD, ACC, TJA, TSR, ISA.' },
    { name: 'Horizon Mono 3', sublabel: 'Mono 3', rail: '12V',
      notes: 'Horizon Mono 3 on Journey 3: 8MP front camera @120 deg plus optional 4x 2MP @195 deg surround; enhanced L2/L2+ ADAS, 360-degree proactive safety, ICA, APA/RPA parking.' },
    { name: 'Horizon Mono 6', sublabel: 'Mono 6', rail: '12V',
      notes: 'Horizon Mono 6 on 1x Journey 6B: 17MP front camera @140 deg, optional 4x 3MP @195 deg surround and 3MP @60 deg, optional 32-channel LiDAR; enhanced L2/L2+ ADAS, 5-star AEB (C-NCAP 27-30, E-NCAP 26-29), ICA, APA/RPA.' },
    { name: 'Horizon SuperDrive HSD 300', sublabel: 'HSD 300', rail: '12V',
      notes: 'Horizon SuperDrive HSD 300 on Journey 6P: 11 cameras, 1 radar, optional LiDAR; one-stage end-to-end assisted driving across urban, highway, and parking (APA, HPA).' },
    { name: 'Horizon SuperDrive HSD 600', sublabel: 'HSD 600', rail: '12V',
      notes: 'Horizon SuperDrive HSD 600 on Journey 6P: 11 cameras, 3 radars, optional LiDAR; end-to-end urban, highway, and parking assistance.' },
    { name: 'Horizon SuperDrive HSD 1200', sublabel: 'HSD 1200', rail: '12V',
      notes: 'Horizon SuperDrive HSD 1200 on Journey 6P: 11 cameras, 3 radars, optional LiDAR; the top HSD sensor package for full-scenario assisted driving.' },
  ],
  mipicam: [
    { name: 'D-Robotics RDK Camera RS800W', sublabel: 'RS800W', rail: '',
      notes: 'D-Robotics RDK Camera RS800W: 8MP rolling-shutter MIPI CSI module for RDK X5 / X3.' },
    { name: 'D-Robotics RDK X3 Camera RS400W', sublabel: 'RS400W', rail: '',
      notes: 'D-Robotics RDK X3 Camera RS400W: 4MP rolling-shutter MIPI CSI module.' },
    { name: 'Sony IMX219 module', sublabel: 'IMX219', rail: '', notes: '8MP MIPI CSI-2 camera module (Camera Module v2 class).' },
    { name: 'Sony IMX477 (HQ camera)', sublabel: 'IMX477', rail: '', notes: '12.3MP MIPI CSI-2 with a C/CS-mount lens.' },
    { name: 'OmniVision OV5647', sublabel: 'OV5647', rail: '', notes: '5MP MIPI CSI-2 camera module (Camera Module v1 class).' },
  ],
  depthcam: [
    { name: 'D-Robotics RDK Stereo Camera Module', sublabel: 'RDK Stereo Camera', rail: '',
      notes: 'D-Robotics RDK Stereo Camera Module: 2MP stereo pair over MIPI CSI for depth on RDK boards.' },
    { name: 'Intel RealSense D435i', sublabel: 'RealSense D435i', rail: '', notes: 'Stereo depth, RGB, and IMU over USB 3.' },
    { name: 'Orbbec Gemini 2', sublabel: 'Gemini 2', rail: '', notes: 'Stereo depth and RGB over USB 3.' },
  ],
  servobus: [
    { name: 'Feetech STS3215 serial servo', sublabel: 'STS3215', rail: '12V', notes: 'TTL/RS-485 serial bus servo, daisy-chainable.' },
    { name: 'Dynamixel XL430-W250', sublabel: 'XL430-W250', rail: '12V', notes: 'TTL serial bus servo, daisy-chainable.' },
  ],
  lidar: [
    { name: 'SLAMTEC RPLIDAR A1', sublabel: 'RPLIDAR A1', rail: '5V', notes: '2D 360-degree laser scanner, 12 m range, UART.' },
    { name: 'SLAMTEC RPLIDAR C1', sublabel: 'RPLIDAR C1', rail: '5V', notes: '2D 360-degree laser scanner, 12 m range, UART.' },
  ],
};

export function presetsFor(kind) {
  return PRESETS[kind] || [];
}

// The patch to apply when the Part number field changes: a preset matched by
// part number or name (case-insensitive) also fills a blank rail and blank
// notes; anything else is stored as typed.
export function presetPatch(node, value) {
  const typed = String(value ?? '').trim();
  const key = typed.toLowerCase();
  const hit = presetsFor(node?.kind).find(
    (p) => p.sublabel.toLowerCase() === key || p.name.toLowerCase() === key,
  );
  if (!hit) return { sublabel: typed };
  const patch = { sublabel: hit.sublabel };
  if (!String(node.rail ?? '').trim() && hit.rail) patch.rail = hit.rail;
  if (!String(node.notes ?? '').trim() && hit.notes) patch.notes = hit.notes;
  return patch;
}
