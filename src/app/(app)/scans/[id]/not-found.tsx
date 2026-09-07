import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';

export default function ScanNotFound() {
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState
        icon="search"
        title="Scan not found"
        description="This scan does not exist, or it was recorded by another officer. Officers can only open scans from their own inspection record."
        action={<LinkButton href="/scans">Back to scan history</LinkButton>}
      />
    </Card>
  );
}
