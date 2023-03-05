alter catalog public rename to staf;
create schema staf authorization SA;
alter user SA set initial schema staf;
set schema staf;

create table appuser (
  username varchar(100) not null constraint pk_appuser primary key,
  password varchar(200),
  disabled boolean
);

create table doc (
  id bigint not null generated always as identity,
  name varchar(500) not null,
  content blob not null,
  content_sha256b64 varchar(44) not null,
  replaces_doc_id bigint constraint fk_doc_doc references doc,
  source_url varchar(4000),
  retrieved timestamp with time zone not null,
  etag varchar(4000),
  source_modified timestamp with time zone,
  constraint pk_doc primary key (id)
);

create table part_content (
  sha256b64 varchar(44) not null constraint pk_partcontent primary key,
  content blob not null
);

create table doc_part (
  doc_id bigint not null constraint fk_docpart_doc references doc,
  part_type varchar(1) not null constraint ck_part_type check (part_type in ('T','F')),
  part_num int not null, -- numbering is local to part type, so table 1 and figure 1 both have part_num of 1
  doc_order int not null,
  description varchar(2000),
  content_sha256b64 varchar(44) not null constraint fk_docpart_partcontent references part_content,
  constraint pk_docpart primary key (doc_id, part_type, part_num)
);
create index ix_docpart_partcontentid on doc_part (content_sha256b64);

create table assembly (
  id bigint not null generated always as identity,
  username varchar(100) not null,
  created timestamp with time zone not null,
  content blob not null,
  constraint pk_asm primary key(id),
  constraint fk_asm_appuser foreign key(username) references appuser
);
create index ix_asm_appuser on assembly (username);

create table assembly_doc_part (
  assembly_id bigint not null constraint fk_asmpart_asm references assembly,
  doc_id bigint not null,
  part_type varchar(1) not null,
  part_num int not null,
  seq int,
  constraint pk_asmdocpart primary key (assembly_id, doc_id, part_type, part_num),
  constraint fk_asmdocpart_docpart foreign key (doc_id, part_type, part_num) references doc_part
);
create index ix_asmdocpart_docpart on assembly_doc_part (doc_id, part_type, part_num);

create table current_guidance (
  doc_id bigint not null constraint fk_curguid_doc references doc,
  constraint pk_curguid primary key (doc_id)
);
