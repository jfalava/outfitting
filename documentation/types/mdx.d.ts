declare module "*.mdx" {
  const Component: React.ComponentType<{
    components?: Record<string, React.ComponentType<Record<string, unknown>>>;
  }>;

  export default Component;
  export const metadata: Record<string, unknown> | undefined;
  export const title: string | undefined;
  export const description: string | undefined;
}
