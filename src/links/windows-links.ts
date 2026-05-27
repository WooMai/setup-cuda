import { AbstractLinks } from './links.js'
import { SemVer } from 'semver'
import windowsLinks from './windows-links.json' with { type: 'json' }

/**
 * Singleton class for windows links.
 */
export class WindowsLinks extends AbstractLinks {
  // Singleton instance
  private static _instance: WindowsLinks

  private cudaVersionToNetworkUrl: Map<string, string> = new Map(
    Object.entries(windowsLinks.network)
  )

  // Private constructor to prevent instantiation
  private constructor() {
    super()
    // Map of cuda SemVer version to download URL
    this.cudaVersionToURL = new Map(Object.entries(windowsLinks.local))
  }

  static get Instance(): WindowsLinks {
    return this._instance || (this._instance = new this())
  }

  getAvailableNetworkCudaVersions(): SemVer[] {
    return Array.from(this.cudaVersionToNetworkUrl.keys()).map(
      (s) => new SemVer(s)
    )
  }

  getNetworkURLFromCudaVersion(version: SemVer): URL {
    const urlString = this.cudaVersionToNetworkUrl.get(`${version}`)
    if (urlString === undefined) {
      throw new Error(`Invalid version: ${version}`)
    }
    return new URL(urlString)
  }
}
