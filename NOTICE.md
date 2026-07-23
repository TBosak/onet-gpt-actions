# Attribution and modification notices

## O*NET Database

This application includes information from the O*NET® Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the Creative Commons Attribution 4.0 International license.

O*NET® is a trademark of USDOL/ETA. This independent application is not sponsored, endorsed, or approved by USDOL/ETA.

The database content is modified by selecting fields, combining records into denormalized occupation profiles, retaining selected normalized relationships, calculating search indexes, and calculating local occupation rankings and profile correlations. The source database itself is not redistributed as an unmodified mirror.

- Database source: https://www.onetcenter.org/database.html
- Database license: https://www.onetcenter.org/license_db.html

## O*NET Career Exploration Tools / Mini Interest Profiler

This application includes information from the O*NET® Career Exploration Tools by USDOL/ETA. Used under the Creative Commons Attribution-NoDerivatives 4.0 International license. O*NET® is a trademark of USDOL/ETA.

The 30 assessment statements, their order, RIASEC mappings, and five response choices are vendored verbatim and marked `modified: false`. The application adds surrounding conversational administration, request validation, deterministic scoring code, and local occupation matching; it does not alter the assessment content.

- Form provenance: https://services.onetcenter.org/reference/mnm/ip/ip_questions_30
- Tools license: https://www.onetcenter.org/license_tools.html
- Source manifest: `src/data/interest-profiler/SOURCE.md`

## CareerOneStop

Current job, labor-market, training, credential, and employment-support information is obtained from CareerOneStop, part of the CareerOneStop suite of web products sponsored by the U.S. Department of Labor, Employment and Training Administration.

CareerOneStop data is requested at runtime, normalized, sanitized, bounded, and combined with local O*NET-derived context and locally calculated fit explanations. CareerOneStop credentials and raw provider request URLs are not redistributed. Provider metadata and source citations are retained when supplied by the API.

- CareerOneStop: https://www.careeronestop.org/
- Web API overview: https://www.careeronestop.org/Developers/WebAPI/web-api.aspx
- API Explorer: https://api.careeronestop.org/api-explorer/
- Citation guidance: https://www.careeronestop.org/Help/cite-this-website.aspx
