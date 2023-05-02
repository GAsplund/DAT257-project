import { FC } from 'react';
import styles from './OrganizationListEntry.module.css';

interface OrganizationListEntryProps {
	id: string;
	name: string;
}

const OrganizationListEntry: FC<OrganizationListEntryProps> = ({
	id,
	name
}) => {
	return (
		<li className={styles.card}>
			<h2>{name}</h2>
			<a href={`./${id}}`}>Manage Organization</a>
		</li>
	);
};

export default OrganizationListEntry;
