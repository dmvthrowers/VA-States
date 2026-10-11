import ModuleBoard from '@/components/ModuleBoard';

export default function Page() {
  return <ModuleBoard module="stream" roles={['admin', 'streamer', 'stream_tech']} />;
}
