import { fileExists } from '../../lib/file-exists'
import { getPagePaths } from '../../shared/lib/page-path/get-page-paths'
import { nonNullable } from '../../lib/non-nullable'
import { join, sep, normalize } from 'path'
import { promises } from 'fs'
import { warn } from '../../build/output/log'
import chalk from '../../lib/chalk'
import { isMetadataRouteFile } from '../../lib/metadata/is-metadata-route'

async function isTrueCasePagePath(pagePath: string, pagesDir: string) {
  const pageSegments = normalize(pagePath).split(sep).filter(Boolean)
  const segmentExistsPromises = pageSegments.map(async (segment, i) => {
    const segmentParentDir = join(pagesDir, ...pageSegments.slice(0, i))
    const parentDirEntries = await promises.readdir(segmentParentDir)
    return parentDirEntries.includes(segment)
  })

  return (await Promise.all(segmentExistsPromises)).every(Boolean)
}

/**
 * Finds a page file with the given parameters. If the page is duplicated with
 * multiple extensions it will throw, otherwise it will return the *relative*
 * path to the page file or null if it is not found.
 *
 * @param pagesDir Absolute path to the pages folder with trailing `/pages`.
 * @param normalizedPagePath The page normalized (it will be denormalized).
 * @param pageExtensions Array of page extensions.
 */
export async function findPageFile(
  pagesDir: string,
  normalizedPagePath: string,
  pageExtensions: string[],
  isAppDir: boolean
): Promise<string | null> {
  const pagePaths = getPagePaths(normalizedPagePath, pageExtensions, isAppDir)
  const [existingPath, ...others] = (
    await Promise.all(
      pagePaths.map(async (path) => {
        const filePath = join(pagesDir, path)
        try {
          return (await fileExists(filePath)) ? path : null
        } catch (err: any) {
          if (!err?.code?.includes('ENOTDIR')) throw err
        }
        return null
      })
    )
  ).filter(nonNullable)

  if (!existingPath) {
    return null
  }

  if (!(await isTrueCasePagePath(existingPath, pagesDir))) {
    return null
  }

  if (others.length > 0) {
    warn(
      `Duplicate page detected. ${chalk.cyan(
        join('pages', existingPath)
      )} and ${chalk.cyan(
        join('pages', others[0])
      )} both resolve to ${chalk.cyan(normalizedPagePath)}.`
    )
  }

  return existingPath
}

/**
 *
 * createValidFileMatcher receives configured page extensions and return helpers to determine:
 * `isLayoutsLeafPage`: if a file is a valid page file or routes file under app directory
 * `isTrackedFiles`: if it's a tracked file for webpack watcher
 *
 */
export function createValidFileMatcher(
  pageExtensions: string[],
  appDirPath: string | undefined
) {
  const getExtensionRegexString = (extensions: string[]) =>
    `(?:${extensions.join('|')})`

  const validExtensionFileRegex = new RegExp(
    '\\.' + getExtensionRegexString(pageExtensions) + '$'
  )
  const leafOnlyPageFileRegex = new RegExp(
    `(^(page|route)|[\\\\/](page|route))\\.${getExtensionRegexString(
      pageExtensions
    )}$`
  )
  /** TODO-METADATA: support other metadata routes
   *  regex for:
   *
   * /robots.txt|<ext>
   * /sitemap.xml|<ext>
   * /favicon.ico
   * /manifest.json|<ext>
   * <route>/icon.png|jpg|<ext>
   * <route>/apple-touch-icon.png|jpg|<ext>
   *
   */

  /**
   * Match the file if it's a metadata route file, static: if the file is a static metadata file
   *
   */
  function isMetadataFile(filePath: string) {
    const appDirRelativePath = filePath.replace(appDirPath || '', '')

    return isMetadataRouteFile(appDirRelativePath, pageExtensions, true)
  }

  // Determine if the file is leaf node page file or route file under layouts,
  // 'page.<extension>' | 'route.<extension>'
  function isAppRouterPage(filePath: string) {
    return leafOnlyPageFileRegex.test(filePath) || isMetadataFile(filePath)
  }

  function isPageFile(filePath: string) {
    return validExtensionFileRegex.test(filePath) || isMetadataFile(filePath)
  }

  return {
    isPageFile,
    isAppRouterPage,
    isMetadataFile,
  }
}
