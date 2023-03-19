import { RenderOpts } from './types'
import React, { use } from 'next/dist/compiled/react'
import { createErrorHandler } from './create-error-handler'
import { useFlightResponse } from './use-flight-response'
import { FlightResponseRef } from './flight-response-ref'

/**
 * Create a component that renders the Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function createServerComponentRenderer<Props>(
  ComponentToRender: (props: Props) => any,
  ComponentMod: {
    renderToReadableStream: any
    __next_app_webpack_require__?: any
  },
  {
    transformStream,
    clientReferenceManifest,
    serverContexts,
    rscChunks,
  }: {
    transformStream: TransformStream<Uint8Array, Uint8Array>
    clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
    serverContexts: Array<
      [ServerContextName: string, JSONValue: Object | number | string]
    >
    rscChunks: Uint8Array[]
  },
  serverComponentsErrorHandler: ReturnType<typeof createErrorHandler>,
  nonce?: string
): (props: Props) => JSX.Element {
  // We need to expose the `__webpack_require__` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app_webpack_require__) {
    // @ts-ignore
    globalThis.__next_require__ = ComponentMod.__next_app_webpack_require__

    // @ts-ignore
    globalThis.__next_chunk_load__ = () => Promise.resolve()
  }

  let RSCStream: ReadableStream<Uint8Array>
  const createRSCStream = (props: Props) => {
    if (!RSCStream) {
      RSCStream = ComponentMod.renderToReadableStream(
        <ComponentToRender {...(props as any)} />,
        clientReferenceManifest.clientModules,
        {
          context: serverContexts,
          onError: serverComponentsErrorHandler,
        }
      )
    }
    return RSCStream
  }

  const flightResponseRef: FlightResponseRef = { current: null }

  const writable = transformStream.writable
  return function ServerComponentWrapper(props: Props): JSX.Element {
    const reqStream = createRSCStream(props)
    const response = useFlightResponse(
      writable,
      reqStream,
      clientReferenceManifest,
      rscChunks,
      flightResponseRef,
      nonce
    )
    return use(response)
  }
}
