import { redirect } from 'next/navigation';

// Superseded by the unified, searchable/filterable /directory page
// (competitors + spectators + judges/staff in one place).
export default function SpectatorsRedirect() {
  redirect('/directory');
}
