use std::thread;

const MIN_PARALLEL_ITEMS: usize = 16_384;

pub fn for_each_mut<T, F>(items: &mut [T], f: F)
where
    T: Send,
    F: Fn(&mut T) + Sync,
{
    let worker_count = worker_count(items.len());
    if worker_count <= 1 {
        items.iter_mut().for_each(f);
        return;
    }

    let chunk_size = items.len().div_ceil(worker_count);
    let f = &f;

    thread::scope(|scope| {
        for chunk in items.chunks_mut(chunk_size) {
            scope.spawn(move || {
                chunk.iter_mut().for_each(f);
            });
        }
    });
}

pub fn for_each_enumerated_mut<T, F>(items: &mut [T], f: F)
where
    T: Send,
    F: Fn(usize, &mut T) + Sync,
{
    let worker_count = worker_count(items.len());
    if worker_count <= 1 {
        items
            .iter_mut()
            .enumerate()
            .for_each(|(index, item)| f(index, item));
        return;
    }

    let chunk_size = items.len().div_ceil(worker_count);
    let f = &f;

    thread::scope(|scope| {
        for (chunk_index, chunk) in items.chunks_mut(chunk_size).enumerate() {
            let start_index = chunk_index * chunk_size;
            scope.spawn(move || {
                chunk
                    .iter_mut()
                    .enumerate()
                    .for_each(|(offset, item)| f(start_index + offset, item));
            });
        }
    });
}

pub fn map_collect<T, U, F>(items: &[T], f: F) -> Vec<U>
where
    T: Sync,
    U: Send,
    F: Fn(&T) -> U + Sync,
{
    let worker_count = worker_count(items.len());
    if worker_count <= 1 {
        return items.iter().map(f).collect();
    }

    let chunk_size = items.len().div_ceil(worker_count);
    let f = &f;

    thread::scope(|scope| {
        let handles = items
            .chunks(chunk_size)
            .map(|chunk| scope.spawn(move || chunk.iter().map(f).collect::<Vec<_>>()))
            .collect::<Vec<_>>();

        let mut output = Vec::with_capacity(items.len());
        for handle in handles {
            output.extend(handle.join().expect("parallel pixel worker panicked"));
        }
        output
    })
}

pub fn map_enumerated_collect<T, U, F>(items: &[T], f: F) -> Vec<U>
where
    T: Sync,
    U: Send,
    F: Fn(usize, &T) -> U + Sync,
{
    let worker_count = worker_count(items.len());
    if worker_count <= 1 {
        return items
            .iter()
            .enumerate()
            .map(|(index, item)| f(index, item))
            .collect();
    }

    let chunk_size = items.len().div_ceil(worker_count);
    let f = &f;

    thread::scope(|scope| {
        let handles = items
            .chunks(chunk_size)
            .enumerate()
            .map(|(chunk_index, chunk)| {
                let start_index = chunk_index * chunk_size;
                scope.spawn(move || {
                    chunk
                        .iter()
                        .enumerate()
                        .map(|(offset, item)| f(start_index + offset, item))
                        .collect::<Vec<_>>()
                })
            })
            .collect::<Vec<_>>();

        let mut output = Vec::with_capacity(items.len());
        for handle in handles {
            output.extend(handle.join().expect("parallel pixel worker panicked"));
        }
        output
    })
}

fn worker_count(item_count: usize) -> usize {
    if item_count < MIN_PARALLEL_ITEMS {
        return 1;
    }

    thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
        .min(item_count)
}
