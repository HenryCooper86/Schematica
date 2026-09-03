// Vendor presets: real products offered in the Part number field of a generic
// part. Picking one fills the part number and, when they are blank, the rail
// and a one-line spec note. Palette kinds stay generic; vendors are data.
// Figures are the vendors' own published numbers.
export const PRESETS = {
  aisbc: [
    { name: 'D-Robotics RDK X5', sublabel: 'RDK X5', rail: '5V',
      notes: 'D-Robotics RDK X5: Sunrise 5, 10 TOPS BPU; 2x MIPI CSI, GbE, USB 3, CAN FD, 40-pin header; TogetheROS.Bot.' },
    { name: 'D-Robotics RDK X3', sublabel: 'RDK X3', rail: '5V',
      notes: 'D-Robotics RDK X3: Sunrise 3, 5 TOPS BPU; Raspberry Pi 4B / CM4 compatible interfaces.' },
    { name: 'D-Robotics RDK X3 Module', sublabel: 'RDK X3 Module', rail: '5V',
      notes: 'D-Robotics RDK X3 Module: CM4-form-factor module, Sunrise 3, 5 TOPS BPU.' },
    { name: 'D-Robotics RDK S100', sublabel: 'RDK S100', rail: '12V',
      notes: 'D-Robotics RDK S100: 80+ TOPS heterogeneous module for embodied intelligence; perception, reasoning, and real-time motion control.' },
    { name: 'Raspberry Pi 5', sublabel: 'Raspberry Pi 5', rail: '5V',
      notes: 'Raspberry Pi 5: BCM2712; 2x MIPI CSI/DSI, GbE, USB 3, 40-pin header.' },
    { name: 'NVIDIA Jetson Orin Nano', sublabel: 'Jetson Orin Nano', rail: '5V',
      notes: 'NVIDIA Jetson Orin Nano: up to 40 TOPS; 2x MIPI CSI, GbE, USB 3, 40-pin header.' },
  ],
  autosoc: [
    { name: 'Horizon Journey 6P', sublabel: 'Journey 6P', rail: '',
      notes: 'Horizon Journey 6P: 560 TOPS BPU Nash; flagship for full-scenario urban NOA (Horizon SuperDrive).' },
    { name: 'Horizon Journey 6M', sublabel: 'Journey 6M', rail: '',
      notes: 'Horizon Journey 6M: 128 TOPS; highway NOA and parking (Horizon Pilot class).' },
    { name: 'Horizon Journey 6E', sublabel: 'Journey 6E', rail: '',
      notes: 'Horizon Journey 6E: 80 TOPS; highway NOA with a lean sensor set.' },
    { name: 'Horizon Journey 6B', sublabel: 'Journey 6B', rail: '',
      notes: 'Horizon Journey 6B: 10 TOPS; front-camera ADAS, driver monitoring, or parking.' },
    { name: 'Horizon Journey 5', sublabel: 'Journey 5', rail: '',
      notes: 'Horizon Journey 5: 128 TOPS; mass-produced highway NOA generation.' },
    { name: 'Horizon Journey 3', sublabel: 'Journey 3', rail: '',
      notes: 'Horizon Journey 3: 5 TOPS; front-camera ADAS (Horizon Mono) and DMS.' },
  ],
  adas: [
    { name: 'Horizon Mono', sublabel: 'Journey 3', rail: '12V',
      notes: 'Horizon Mono: foundational front-camera ADAS (AEB, LKA, ACC) on a Journey 3-class SoC.' },
    { name: 'Horizon Pilot', sublabel: 'Journey 6M', rail: '12V',
      notes: 'Horizon Pilot: highway NOA with front and surround cameras plus radar fusion on Journey 6M.' },
    { name: 'Horizon SuperDrive (HSD)', sublabel: 'Journey 6P', rail: '12V',
      notes: 'Horizon SuperDrive: one-stage end-to-end urban assisted driving on Journey 6P.' },
  ],
  mipicam: [
    { name: 'Sony IMX219 module', sublabel: 'IMX219', rail: '', notes: '8MP MIPI CSI-2 camera module (Camera Module v2 class).' },
    { name: 'Sony IMX477 (HQ camera)', sublabel: 'IMX477', rail: '', notes: '12.3MP MIPI CSI-2 with a C/CS-mount lens.' },
    { name: 'OmniVision OV5647', sublabel: 'OV5647', rail: '', notes: '5MP MIPI CSI-2 camera module (Camera Module v1 class).' },
  ],
  depthcam: [
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
