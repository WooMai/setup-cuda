import { resolve } from 'node:path'

// NVIDIA's canonical list of every released CUDA Toolkit, linking to each
// version's download page.
export const CUDA_ARCHIVE_URL =
  'https://developer.nvidia.com/cuda-toolkit-archive'

// Archive anchors are root-relative (e.g. "/cuda-13-2-0-download-archive").
export const NVIDIA_BASE_URL = 'https://developer.nvidia.com'

export const WINDOWS_LINKS_PATH = resolve('src/links/windows-links.json')
export const LINUX_LINKS_PATH = resolve('src/links/linux-links.json')
