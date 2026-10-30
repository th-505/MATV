// Build with: npx --yes --package=esbuild@0.28.2 esbuild scratch/conan-relay/provider-entry.mjs --bundle --platform=node --format=esm --minify --alias:cheerio=cheerio/slim --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile=scratch/conan-relay/provider-runtime.mjs
// The vendored build keeps the isolated Render service dependency-free while
// reusing the repository's real adapters and guarded HTTP implementation.
export {listProviders,getProvider} from '../../server/scrapers/registry.mjs';
export {unwrapEmbedToDirectStreams} from '../../server/scrapers/stream-unwrapper.mjs';
export {fetchSafeResponse,fetchProviderHtml,assertSafeScraperUrl,assertSafeResolvedHost,isUnsafeIpAddress} from '../../server/scrapers/shared/http.mjs';
