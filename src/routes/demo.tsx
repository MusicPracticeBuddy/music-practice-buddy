import * as fs from 'node:fs'
import { createFileRoute, useRouter } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

const filePath = 'count.txt'

async function readCount() {
  return parseInt(await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'))
}

const getCount = createServerFn({
  method: 'GET',
}).handler(() => {
  return readCount()
})

const updateCount = createServerFn({ method: 'POST' })
  .validator((d: number) => d)
  .handler(async ({ data }) => {
    const count = await readCount()
    await fs.promises.writeFile(filePath, `${count + data}`)
  })

const resetCount = createServerFn({ method: 'POST' }).handler(async () => {
  await fs.promises.writeFile(filePath, `0`)
})

export const Route = createFileRoute('/demo')({
  component: Home,
  loader: async () => await getCount(),
})

function Home() {
  const router = useRouter()
  const state = Route.useLoaderData()

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          updateCount({ data: 1 }).then(() => {
            router.invalidate()
          })
        }}
      >
        Add 1 to {state()}?
      </button>
      <button
        type="button"
        onClick={() => {
          resetCount().then(() => {
            router.invalidate()
          })
        }}
      >
        Reset
      </button>
    </div>
  )
}
