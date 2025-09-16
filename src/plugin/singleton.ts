export const createSingleton = <T>(s?: symbol | string) => {
  const symbol = !s ? Symbol() : s
  return {
    get(container: any) {
      return container[symbol] as T
    },
    set(container: any, value: T) {
      container[symbol] = value
    },
  }
}
